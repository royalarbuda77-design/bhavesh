package com.jarvis.assistant.gemini

import com.jarvis.assistant.core.agent.AgentDecision
import com.jarvis.assistant.core.agent.AgentProtocol
import com.jarvis.assistant.core.config.SettingsRepository
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.memory.ChatTurn
import java.io.IOException
import java.util.Base64
import java.util.concurrent.TimeUnit
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * Zero-SDK, dependency-light Gemini REST client (v1beta) written against raw
 * JSON so nothing breaks when Google renames a field.
 *
 *  • Accepts BOTH key formats — legacy `AIza…` and the new AI-Studio `AQ.…`
 *    keys (2026). Auth is via the `x-goog-api-key` header, identical for both.
 *  • Model auto-fallback ([ModelCatalog]) with a cached "last known good".
 *  • SSE streaming for chat, with non-streaming fallback (self-healing).
 *  • Vision (image parts), Gemini-TTS PCM output, and JSON-schema
 *    constrained agent parsing.
 */
class GeminiClient(private val settings: SettingsRepository) {

    data class ChatResult(val text: String, val streamedSentences: Int)

    /** Raw 16-bit mono PCM (24 kHz) as returned by Gemini TTS models. */
    data class PcmAudio(val bytes: ByteArray, val sampleRateHz: Int = 24000)

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .connectionPool(okhttp3.ConnectionPool(4, 3, TimeUnit.MINUTES))
        .build()

    @Volatile private var cachedChatModel: String? = null
    @Volatile private var modelProbeBackoffUntil: Long = 0L

    // ── public API ───────────────────────────────────────────────────────────

    /** Validate a key with a cheap GET /models call. @return null when the key works. */
    suspend fun testKey(apiKeyOverride: String? = null): String? = withContext(Dispatchers.IO) {
        val cfg = settings.current()
        val key = apiKeyOverride?.takeIf { it.isNotBlank() } ?: cfg.geminiApiKey
        if (key.isBlank()) return@withContext "API key is empty"
        val req = Request.Builder()
            .url("${cfg.apiBaseUrl.trimEnd('/')}/models?pageSize=1")
            .header("x-goog-api-key", key)
            .get()
            .build()
        try {
            http.newCall(req).execute().use { resp ->
                when {
                    resp.isSuccessful -> null
                    resp.code == 401 || resp.code == 403 ->
                        "Key rejected (HTTP ${resp.code}). For `AQ.…` keys ensure the Generative Language API is enabled in Google Cloud."
                    resp.code == 404 -> "Base URL not found (HTTP 404): ${cfg.apiBaseUrl}"
                    else -> "HTTP ${resp.code}: ${resp.body?.string()?.take(160).orEmpty()}"
                }
            }
        } catch (t: IOException) {
            "Network error: ${t.message}"
        }
    }

    /**
     * General conversation / Q&A turn. Streams sentence-by-sentence when
     * [onSentence] is given (used for low-latency TTS); transport hiccups
     * transparently re-run the request one-shot so the user still gets an answer.
     */
    suspend fun chat(
        userText: String,
        history: List<ChatTurn>,
        systemPrompt: String,
        imageJpeg: ByteArray? = null,
        useSearch: Boolean = false,
        onSentence: ((String) -> Unit)? = null
    ): ChatResult {
        val body = buildRequest(
            userText = userText,
            history = history,
            systemPrompt = systemPrompt,
            imageJpeg = imageJpeg,
            useSearch = useSearch,
            maxTokens = 1200,
            temperature = settings.current().temperature,
            responseSchema = null
        )
        return try {
            if (onSentence != null) streamChat(body, onSentence)
            else ChatResult(generateWithFallback(body), 0)
        } catch (t: GeminiException) {
            if (onSentence != null && (t.failure == GeminiFailure.PARSE || t.failure == GeminiFailure.MODEL_UNAVAILABLE)) {
                JarvisLog.w("stream degraded → one-shot retry: ${t.message}")
                ChatResult(generateWithFallback(body), 0)
            } else throw t
        }
    }

    /** Speech → {speech, actions[], followUp} in one schema-constrained call. */
    suspend fun agentDecide(
        userText: String,
        systemPrompt: String,
        deviceContext: String,
        imageJpeg: ByteArray? = null
    ): AgentDecision? {
        val schemaUser = buildString {
            appendLine("USER UTTERANCE: \"$userText\"")
            appendLine(deviceContext)
            if (imageJpeg != null) {
                appendLine("A screenshot of the current screen is attached — use it if the utterance references it.")
            }
        }
        val body = buildRequest(
            userText = schemaUser,
            history = emptyList(),
            systemPrompt = systemPrompt + "\n\n" + AgentProtocol.ACTION_CATALOG +
                "\nReply ONLY with the JSON object defined by responseSchema.",
            imageJpeg = imageJpeg,
            useSearch = false,
            maxTokens = 700,
            temperature = 0.15f,
            responseSchema = AgentProtocol.SCHEMA_JSON
        )
        val raw = generateWithFallback(body)
        return AgentProtocol.parse(raw).also {
            if (it == null) JarvisLog.w("agent JSON parse failed; raw was:\n${raw.take(400)}")
        }
    }

    /** One-shot vision answer (screen analysis, camera-less). */
    suspend fun describeImage(jpeg: ByteArray, question: String, systemPrompt: String): String {
        val body = buildRequest(
            userText = question,
            history = emptyList(),
            systemPrompt = systemPrompt,
            imageJpeg = jpeg,
            useSearch = false,
            maxTokens = 900,
            temperature = 0.3f,
            responseSchema = null
        )
        return generateWithFallback(body)
    }

    /** Gemini neural TTS → raw PCM (played through AudioTrack). Null on any failure. */
    suspend fun synthesizeSpeech(text: String, voiceName: String): PcmAudio? {
        val body = buildRequest(
            userText = "Say aloud, naturally and clearly: $text",
            history = emptyList(),
            systemPrompt = "You are a text-to-speech voice. Repeat the user's text exactly, nothing else.",
            imageJpeg = null,
            useSearch = false,
            maxTokens = 2048,
            temperature = 0.4f,
            responseSchema = null,
            extraGenerationConfig = {
                putJsonArray("responseModalities") { add("AUDIO") }
                putJsonObject("speechConfig") {
                    putJsonObject("voiceConfig") {
                        putJsonObject("prebuiltVoiceConfig") { put("voiceName", voiceName) }
                    }
                }
            }
        )
        var lastError: Throwable? = null
        for (model in ModelCatalog.ttsList()) {
            try {
                val respObj = postJson(model, ":generateContent", body)
                val pcm = firstInlineBytes(respObj, "audio")
                if (pcm != null) return PcmAudio(pcm)
            } catch (t: Throwable) {
                if (t is CancellationException) throw t
                lastError = t
                val retryable = t is GeminiException &&
                    (t.failure == GeminiFailure.MODEL_UNAVAILABLE || t.failure == GeminiFailure.PARSE)
                if (!retryable) break
            }
        }
        JarvisLog.w("Gemini TTS failed", lastError)
        return null
    }

    // ── request building ─────────────────────────────────────────────────────

    private fun buildRequest(
        userText: String,
        history: List<ChatTurn>,
        systemPrompt: String,
        imageJpeg: ByteArray?,
        useSearch: Boolean,
        maxTokens: Int,
        temperature: Float,
        responseSchema: String?,
        extraGenerationConfig: (JsonObjectBuilder.() -> Unit)? = null
    ): JsonObject {
        val contents = buildJsonArray {
            history.forEach { turn ->
                addJsonObject {
                    put("role", if (turn.role == "model") "model" else "user")
                    put("parts", buildJsonArray {
                        addJsonObject { put("text", turn.text) }
                    })
                }
            }
            addJsonObject {
                put("role", "user")
                put("parts", buildJsonArray {
                    addJsonObject { put("text", userText) }
                    if (imageJpeg != null) {
                        addJsonObject {
                            put("inline_data", buildJsonObject {
                                put("mime_type", "image/jpeg")
                                put("data", Base64.getEncoder().encodeToString(imageJpeg))
                            })
                        }
                    }
                })
            }
        }

        val generation = buildJsonObject {
            put("maxOutputTokens", maxTokens)
            put("temperature", temperature)
            if (responseSchema != null) {
                put("responseMimeType", "application/json")
                put("responseSchema", json.parseToJsonElement(responseSchema))
            }
            // TTS modalities / speech config are injected here.
            extraGenerationConfig?.invoke(this)
        }

        return buildJsonObject {
            if (systemPrompt.isNotBlank()) {
                put("systemInstruction", buildJsonObject {
                    put("parts", buildJsonArray { addJsonObject { put("text", systemPrompt) } })
                })
            }
            put("contents", contents)
            put("generationConfig", generation)
            if (useSearch) {
                putJsonArray("tools") { addJsonObject { putJsonObject("google_search") {} } }
            }
        }
    }

    // ── core calls ───────────────────────────────────────────────────────────

    private suspend fun generateWithFallback(body: JsonObject): String {
        val preferred = settings.current().chatModel
        val now = System.currentTimeMillis()
        val cached = cachedChatModel?.takeIf { now > modelProbeBackoffUntil }
        val candidates = if (cached != null) listOf(cached) else ModelCatalog.chatList(preferred)
        var last: GeminiException? = null
        for (model in candidates) {
            try {
                val obj = postJson(model, ":generateContent", body)
                cachedChatModel = model
                val text = firstText(obj)
                if (!text.isNullOrBlank()) return text
                last = GeminiException(GeminiFailure.PARSE, "empty response (${finishReason(obj) ?: "unknown"})")
            } catch (t: GeminiException) {
                last = t
                when (t.failure) {
                    GeminiFailure.MODEL_UNAVAILABLE -> continue   // probe next model
                    GeminiFailure.NO_NETWORK, GeminiFailure.RATE_LIMITED,
                    GeminiFailure.KEY_MISSING, GeminiFailure.KEY_INVALID -> break
                    else -> continue
                }
            }
        }
        if (candidates.size > 1) modelProbeBackoffUntil = System.currentTimeMillis() + 60_000
        throw last ?: GeminiException(GeminiFailure.MODEL_UNAVAILABLE, "no Gemini model responded")
    }

    private suspend fun streamChat(body: JsonObject, onSentence: (String) -> Unit): ChatResult =
        withContext(Dispatchers.IO) {
            val cfg = settings.current()
            val model = cachedChatModel ?: ModelCatalog.chatList(cfg.chatModel).first()
            val req = Request.Builder()
                .url("${cfg.apiBaseUrl.trimEnd('/')}/models/$model:streamGenerateContent?alt=sse")
                .header("x-goog-api-key", requireKey(cfg.geminiApiKey))
                .header("Content-Type", "application/json")
                .post(body.toString().toRequestBody(jsonMedia))
                .build()
            try {
                http.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) throw httpFailure(model, resp)
                    val full = StringBuilder()
                    val sentenceBuf = StringBuilder()
                    var emitted = 0
                    val source = resp.body?.source()
                        ?: throw GeminiException(GeminiFailure.PARSE, "empty stream")
                    while (true) {
                        coroutineContext.ensureActive()
                        val line = source.readUtf8Line() ?: break
                        if (!line.startsWith("data:")) continue
                        val payload = line.substring(5).trim()
                        if (payload.isEmpty() || payload == "[DONE]") continue
                        val delta = runCatching {
                            firstText(json.parseToJsonElement(payload).jsonObject)
                        }.getOrNull().orEmpty()
                        if (delta.isEmpty()) continue
                        full.append(delta)
                        sentenceBuf.append(delta)
                        if (looksLikeSentenceEnd(sentenceBuf)) {
                            val s = sentenceBuf.toString().trim()
                            sentenceBuf.setLength(0)
                            if (s.isNotEmpty()) {
                                onSentence(s)
                                emitted++
                            }
                        }
                    }
                    if (sentenceBuf.isNotBlank()) {
                        onSentence(sentenceBuf.toString().trim())
                        emitted++
                    }
                    if (full.isEmpty()) throw GeminiException(GeminiFailure.PARSE, "no deltas")
                    cachedChatModel = model
                    ChatResult(full.toString(), emitted)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                throw GeminiException(GeminiFailure.NO_NETWORK, e.message ?: "network", e)
            }
        }

    private fun httpFailure(model: String, resp: Response): GeminiException {
        val snippet = runCatching { resp.body?.string()?.take(200) }.getOrNull().orEmpty()
        return when {
            resp.code == 401 || resp.code == 403 ->
                GeminiException(GeminiFailure.KEY_INVALID, "auth failed (HTTP ${resp.code}) — check the key in Settings")
            resp.code == 429 -> GeminiException(GeminiFailure.RATE_LIMITED, "quota exhausted")
            resp.code == 404 -> GeminiException(GeminiFailure.MODEL_UNAVAILABLE, "model $model unavailable (404)")
            resp.code in 500..599 -> GeminiException(GeminiFailure.MODEL_UNAVAILABLE, "Google edge error ${resp.code}")
            else -> GeminiException(GeminiFailure.PARSE, "HTTP ${resp.code}: $snippet")
        }
    }

    private suspend fun postJson(model: String, method: String, body: JsonObject): JsonObject =
        withContext(Dispatchers.IO) {
            val cfg = settings.current()
            val req = Request.Builder()
                .url("${cfg.apiBaseUrl.trimEnd('/')}/models/$model$method")
                .header("x-goog-api-key", requireKey(cfg.geminiApiKey))
                .header("Content-Type", "application/json")
                .post(body.toString().toRequestBody(jsonMedia))
                .build()
            try {
                http.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) throw httpFailure(model, resp)
                    val bodyStr = runCatching { resp.body?.string() }.getOrNull().orEmpty()
                    runCatching { json.parseToJsonElement(bodyStr).jsonObject }
                        .getOrElse { throw GeminiException(GeminiFailure.PARSE, "bad json: ${bodyStr.take(120)}", it) }
                }
            } catch (t: CancellationException) {
                throw t
            } catch (t: IOException) {
                throw GeminiException(GeminiFailure.NO_NETWORK, t.message ?: "network", t)
            }
        }

    private fun requireKey(k: String): String {
        if (k.isBlank()) throw GeminiException(GeminiFailure.KEY_MISSING, "no api key configured")
        return k
    }

    // ── tiny JSON walkers (lenient, future-proof) ────────────────────────────

    private fun firstText(root: JsonObject): String? {
        return try {
            val cand = root["candidates"]?.jsonArray?.firstOrNull()?.jsonObject ?: return null
            val fr = cand["finishReason"]?.jsonPrimitive?.contentOrNull
            if (fr != null && fr != "STOP" && fr != "MAX_TOKENS" &&
                (fr.contains("SAFETY") || fr.contains("BLOCKLIST") || fr.contains("PROHIBITED"))
            ) {
                throw GeminiException(GeminiFailure.BLOCKED, "response blocked ($fr)")
            }
            cand["content"]?.jsonObject?.get("parts")?.jsonArray
                ?.mapNotNull { p -> (p.jsonObject["text"] as? JsonPrimitive)?.contentOrNull }
                ?.joinToString("")?.trim()
        } catch (t: GeminiException) {
            throw t
        } catch (t: Throwable) {
            null
        }
    }

    private fun finishReason(root: JsonObject): String? = runCatching {
        root["candidates"]?.jsonArray?.firstOrNull()?.jsonObject
            ?.get("finishReason")?.jsonPrimitive?.contentOrNull
    }.getOrNull()

    private fun firstInlineBytes(root: JsonObject, wantKind: String): ByteArray? {
        return runCatching {
            val parts = root["candidates"]?.jsonArray?.firstOrNull()?.jsonObject
                ?.get("content")?.jsonObject?.get("parts")?.jsonArray ?: return@runCatching null
            for (p in parts) {
                val obj = p as? JsonObject ?: continue
                val inline = obj["inlineData"] ?: obj["inline_data"] ?: continue
                val io = inline as? JsonObject ?: continue
                val mime = (obj["mimeType"] ?: io["mimeType"] ?: io["mime_type"])
                    ?.jsonPrimitive?.contentOrNull.orEmpty()
                if (!mime.contains(wantKind)) continue
                val b64 = (io["data"] as? JsonPrimitive)?.contentOrNull ?: continue
                return@runCatching Base64.getMimeDecoder().decode(b64)
            }
            null
        }.getOrNull()
    }

    private fun looksLikeSentenceEnd(sb: StringBuilder): Boolean {
        val t = sb.trimEnd()
        if (t.length < 24) return false
        val last = t.last()
        return last == '.' || last == '!' || last == '?' || last == '।' ||
            last == '।' || last == '\n' || t.endsWith("…")
    }
}

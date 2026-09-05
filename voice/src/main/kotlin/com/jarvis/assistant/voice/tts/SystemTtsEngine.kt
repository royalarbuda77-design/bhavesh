package com.jarvis.assistant.voice.tts

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import com.jarvis.assistant.core.config.SettingsRepository
import com.jarvis.assistant.core.config.VoiceStyle
import com.jarvis.assistant.core.log.JarvisLog
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * On-device Android TTS (offline-capable).
 * Voice persona selection: match locale + gender from installed voices, then
 * apply pitch/rate signature per [VoiceStyle]. Robust on stock devices and on
 * phones where Google TTS is missing (falls back to whatever engine exists).
 */
class SystemTtsEngine(
    private val context: Context,
    private val settings: SettingsRepository
) : TtsEngine {

    override val id = "system"

    private var tts: TextToSpeech? = null
    @Volatile private var ready = false
    private var initLatch = CountDownLatch(1)

    private data class Hooks(val done: () -> Unit, val fail: () -> Unit)
    private val hooks = ConcurrentHashMap<String, Hooks>()
    @Volatile private var lastStyle: VoiceStyle? = null
    @Volatile private var lastLang: String? = null

    override fun prepare() {
        if (tts != null) return
        synchronized(this) {
            if (tts != null) return
            val engine = pickEngine()
            @Suppress("DEPRECATION")
            val instance = runCatching {
                        TextToSpeech(context, { status ->
                            ready = status == TextToSpeech.SUCCESS
                            initLatch.countDown()
                            JarvisLog.i("system TTS ready=$ready status=$status engine=${engine ?: "default"}")
                            if (ready) wireListener()
                        }, engine)
                    }
                    .recoverCatching {
                        @Suppress("DEPRECATION")
                        TextToSpeech(context, { status ->
                            ready = status == TextToSpeech.SUCCESS
                            initLatch.countDown()
                            if (ready) wireListener()
                        })
                    }
                    .getOrNull()
            instance?.let {
                it.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                tts = it
            } ?: run { initLatch.countDown() }
        }
    }

    private fun wireListener() {
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) { }
            override fun onDone(utteranceId: String?) {
                hooks.remove(utteranceId ?: return)?.let { runCatching { it.done() } }
            }
            @Deprecated("legacy")
            override fun onError(utteranceId: String?) {
                hooks.remove(utteranceId ?: return)?.let { runCatching { it.fail() } }
            }
            override fun onError(utteranceId: String?, errorCode: Int) {
                hooks.remove(utteranceId ?: return)?.let { runCatching { it.fail() } }
            }
        })
    }

    /** Choose Google TTS when installed (best Indian-language voices). */
    private fun pickEngine(): String? = runCatching {
        val services = context.packageManager.queryIntentServices(
            Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE), 0
        )
        val names = services.mapNotNull { it.serviceInfo?.packageName }
        names.firstOrNull { it == "com.google.android.tts" }
            ?: names.firstOrNull { it.contains("tts", true) }
            ?: names.firstOrNull()
    }.getOrNull()

    /** Re-apply persona after settings changes. */
    fun refreshPersona() {
        lastStyle = null
        lastLang = null
    }

    override suspend fun speak(text: String, langHint: String?, utteranceId: String): Boolean {
        prepare()
        val engine = tts ?: return false
        if (!ready) {
            // engine still initialising — wait briefly instead of failing (self-heal)
            val got = runCatching { initLatch.await(4, TimeUnit.SECONDS) }.getOrDefault(false)
            if (!got || !ready) return false
            wireListener()
        }
        val cfg = settings.current()
        applyPersona(engine, cfg.voiceStyle, langHint ?: (if (cfg.replyLanguage == "auto") null else cfg.replyLanguage))

        return suspendCancellableCoroutine { cont ->
            hooks[utteranceId] = Hooks(
                done = { cont.resume(true) },
                fail = { cont.resume(false) }
            )
            cont.invokeOnCancellation {
                hooks.remove(utteranceId)
                runCatching { engine.stop() }
            }
            val params = Bundle().apply {
                putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId)
                putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
            }
            val r = runCatching { engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId) }
                .getOrDefault(TextToSpeech.ERROR)
            if (r != TextToSpeech.SUCCESS) {
                hooks.remove(utteranceId)
                JarvisLog.w("speak() rejected by engine (code $r)")
                cont.resume(false)
            }
        }
    }

    private fun applyPersona(engine: TextToSpeech, style: VoiceStyle, lang: String?) {
        if (lastStyle == style && lastLang == lang) return
        lastStyle = style
        lastLang = lang

        val targetLocales: List<Locale> = when (lang) {
            "gu" -> listOf(Locale("gu", "IN"), Locale("en", "IN"))
            "hi" -> listOf(Locale("hi", "IN"), Locale("en", "IN"))
            "en" -> listOf(Locale("en", "IN"), Locale.US)
            else -> listOf(Locale.getDefault(), Locale("en", "IN"), Locale.US)
        }
        var langOk = false
        for (loc in targetLocales) {
            val res = runCatching { engine.setLanguage(loc) }.getOrDefault(TextToSpeech.LANG_NOT_SUPPORTED)
            if (res != TextToSpeech.LANG_MISSING_DATA && res != TextToSpeech.LANG_NOT_SUPPORTED) {
                langOk = true
                break
            }
        }
        if (!langOk) JarvisLog.d("system TTS locale missing → kept ${engine.language}")

        // gender-matched voice, else pitch/rate persona
        val wantFemale = style == VoiceStyle.NATURAL_FEMALE
        val wantRobotic = style == VoiceStyle.ROBOTIC
        val best = runCatching {
            engine.voices?.filter { it.isActive.not() && it.isLocal && it.quality >= 0 }
                ?.sortedByDescending { v ->
                    var score = 0
                    if (v.locale.language == (engine.language?.language ?: "en")) score += 6
                    val g = v.gender
                    score += when {
                        wantFemale && g == Voice.GENDER_FEMALE -> 10
                        !wantFemale && g == Voice.GENDER_MALE -> 8
                        else -> 0
                    }
                    if (v.name.contains("google", true)) score += 4
                    if (v.name.contains("courtney|samantha|kajal|swara|veena", true)) score += if (wantFemale) 3 else -2
                    if (v.name.contains("david|matthew|justin|rishi", true)) score += if (wantFemale) -2 else 3
                    score
                }?.firstOrNull()
        }.getOrNull()
        runCatching { if (best != null) engine.voice = best }

        engine.setSpeechRate(
            when (style) {
                VoiceStyle.DEEP_MALE -> 0.95f
                VoiceStyle.ROBOTIC -> 1.08f
                VoiceStyle.NATURAL_FEMALE -> 1.02f
            }
        )
        engine.setPitch(
            when (style) {
                VoiceStyle.DEEP_MALE -> if (best?.gender == Voice.GENDER_MALE) 0.78f else 0.62f
                VoiceStyle.ROBOTIC -> 1.24f
                VoiceStyle.NATURAL_FEMALE -> if (best?.gender == Voice.GENDER_FEMALE) 1.06f else 1.30f
            }
        )
    }

    override fun stopAll() {
        hooks.values.forEach { runCatching { it.fail() } }
        hooks.clear()
        runCatching { tts?.stop() }
    }

    override fun release() {
        stopAll()
        runCatching { tts?.shutdown() }
        tts = null
        ready = false
    }
}

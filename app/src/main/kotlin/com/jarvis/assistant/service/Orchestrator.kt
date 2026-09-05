package com.jarvis.assistant.service

import com.jarvis.assistant.automation.router.RoutedOutcome
import com.jarvis.assistant.automation.screen.ScreenContext
import com.jarvis.assistant.core.agent.AgentDecision
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.nlu.OfflineNlu
import com.jarvis.assistant.core.state.AssistantState
import com.jarvis.assistant.core.state.JarvisBus
import com.jarvis.assistant.core.state.JarvisEvent
import com.jarvis.assistant.core.state.NoticeLevel
import com.jarvis.assistant.core.util.TextNorm
import com.jarvis.assistant.di.AppContainer
import com.jarvis.assistant.gemini.GeminiException
import com.jarvis.assistant.gemini.Prompts
import com.jarvis.assistant.voice.Sfx
import com.jarvis.assistant.voice.gate.AudioGate
import com.jarvis.assistant.voice.stt.SttEngine
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The brain-loop. One pipeline for every input (wake-word, tap-to-talk, typed):
 *
 *   transcript → [short-circuits] → offline router → Gemini agent (actions)
 *              → Gemini chat (streamed sentences → TTS) → memory
 *
 * Rules it obeys (the "zero bug" contract):
 *  • Any single failure degrades to a spoken apology — never a crash,
 *    never silence-without-feedback.
 *  • Offline path (NLU+router) always runs first: instant & data-free.
 *  • Screenshot vision only when the user asks about the current screen.
 */
class Orchestrator(private val c: AppContainer) {

    private val settings get() = c.settings
    @Volatile private var followUpContext: String? = null

    // ── listening ────────────────────────────────────────────────────────────

    /** @param manual true when user tapped — mic taken exclusively for the burst. */
    fun beginListening(manual: Boolean) {
        val state = JarvisBus.latestState.value
        if (state == AssistantState.LISTENING) return
        if (state == AssistantState.SPEAKING) c.tts.stop()
        if (manual) c.wake.releaseMic()          // gate stops → no mic contention
        set(AssistantState.LISTENING, if (manual) "tap-to-talk" else "wake")
        c.playSfx(Sfx.Cue.LISTEN_OPEN)
        c.stt.maxUtteranceMs = 15_000
        c.stt.silenceMs = 7_000
        c.stt.start(
            language = settings.current().sttLanguage.takeIf { it != "auto" },
            phraseList = null,
            cb = sessionCallback
        )
    }

    fun endListening() {
        c.stt.cancel()
        c.playSfx(Sfx.Cue.LISTEN_CLOSE)
        if (!c.tts.isSpeaking) set(AssistantState.IDLE)
        JarvisService.instance?.resumeWakeIfArmed()
    }

    private val sessionCallback = object : SttEngine.Callback {
        override fun onPartial(text: String) {
            JarvisBus.post(JarvisEvent.PartialTranscript(text))
        }

        override fun onFinal(text: String, confidence: Float) {
            JarvisBus.post(JarvisEvent.UserUtterance(text, confidence))
            set(AssistantState.THINKING)
            c.scope.launchSelfHealing("session") {
                processUtterance(text, confidence)
            }
        }

        override fun onFatalError(code: Int) {
            set(AssistantState.IDLE)
            JarvisBus.post(
                JarvisEvent.Notice(
                    NoticeLevel.WARN,
                    if (code == -1) "No speech recognizer on device — install Google voice services."
                    else "Microphone session failed ($code) — retrying on the next utterance."
                )
            )
            JarvisService.instance?.resumeWakeIfArmed()
        }
    }

    // ── utterance pipeline ───────────────────────────────────────────────────

    suspend fun processUtterance(raw: String, confidence: Float = 1f) {
        var utterance = raw.trim()
        if (utterance.isBlank()) { set(AssistantState.IDLE); return }

        // strip a leading wake word so "jarvis wifi on" parses as "wifi on"
        if (OfflineNlu.mentionsJarvis(utterance)) {
            utterance = utterance.split(' ').dropWhile { w ->
                TextNorm.fuzzyTokenMatch(w, "jarvis", 2) || w.lowercase() in
                    listOf("hey", "hello", "ji", "sir", "and")
            }.joinToString(" ").ifBlank { utterance }
        }

        followUpContext?.let { prior ->
            utterance = "$prior\n[user answered:] $utterance"
            followUpContext = null
        }

        if (settings.current().memoryEnabled) c.conversation.add("user", utterance)
        JarvisBus.post(JarvisEvent.UserUtterance(utterance, confidence))
        set(AssistantState.THINKING)

        // 1) session control phrases
        when {
            OfflineNlu.isShutdownPhrase(utterance) -> {
                respond("Shutting down. Tap the orb or say nothing — I will stay asleep until you call me.", "Shutdown Jarvis")
                JarvisService.instance?.sleepMode(speakFirst = false)
                return
            }
            OfflineNlu.isStopSpeaking(utterance) && c.tts.isSpeaking -> {
                c.tts.stop(); set(AssistantState.IDLE); return
            }
        }

        // 2) offline, instant, zero-data path
        val offline = c.router.handleOffline(utterance)
        when (offline) {
            is RoutedOutcome.Done -> {
                finishWith(offline.speech, offline.showText, offline.followUp)
                return
            }
            is RoutedOutcome.NeedsVision -> {
                visionTurn(offline.question, utterance)
                return
            }
            RoutedOutcome.NotHandled -> Unit
        }

        // 3) Gemini brain
        val cfg = settings.current()
        if (!cfg.hasApiKey) {
            val line = if (c.net.isOnline()) keyMissingLine(utterance) else when (TextNorm.detectLang(utterance)) {
                "gu" -> "ઇન્ટરનેટ નથી — હું ઑફલાઇન કમાન્ડ્સ જ ચલાવી શકું."
                "hi" -> "इंटरनेट नहीं — मैं केवल ऑफ़लाइन कमांड चला सकता हूँ।"
                else -> "Offline — I can only run device commands right now."
            }
            respond(line, null, null)
            return
        }
        try {
            val system = Prompts.agentSystem(
                cfg.replyLanguage,
                if (cfg.memoryEnabled) c.memory.promptBlock() else "",
                deviceContextLine()
            )
            val decision: AgentDecision? = withTimeoutQuietly {
                SelfHealing.retry("gemini-agent", attempts = 2, baseDelayMs = 600) {
                    c.gemini.agentDecide(utterance, system, deviceContextLine())
                }
            }
            when {
                decision != null && decision.actions.isNotEmpty() -> {
                    val routed = c.router.handleAgent(decision.actions, utterance)
                    when (routed) {
                        is RoutedOutcome.Done ->
                            finishWith(routed.speech.ifBlank { decision.speech }, routed.showText, routed.followUp)
                        is RoutedOutcome.NeedsVision ->
                            visionTurn(decision.speech.ifBlank { utterance }, utterance)
                        RoutedOutcome.NotHandled ->
                            finishWith(decision.speech.ifBlank { "I could not perform that right now." }, null, null)
                    }
                    decision.followUpQuestion?.let { followUpContext = "$utterance (needs: $it)" }
                    return
                }
                decision != null && decision.isConversation -> {
                    if (decision.speech.isNotBlank()) {
                        respond(decision.speech, null, null)
                        if (settings.current().memoryEnabled) c.conversation.add("model", decision.speech)
                        set(AssistantState.IDLE)
                        return
                    }
                    // fall through to streaming chat
                }
                decision != null -> { // follow-up only
                    respond(decision.followUpQuestion ?: decision.speech, null, decision.followUpQuestion)
                    return
                }
                else -> {
                    // agent failed → plain chat with streamed TTS
                    chatTurn(utterance)
                    return
                }
            }
        } catch (g: GeminiException) {
            speakFailure(g, utterance)
            return
        } catch (t: Throwable) {
            SelfHealing.reportError("orchestrator", t)
            respond("Some circuits flickered — say that again?", null, null)
            return
        }
        chatTurn(utterance)
    }

    /** Plain conversational answer, streamed sentence-by-sentence into TTS. */
    private suspend fun chatTurn(utterance: String) {
        val cfg = settings.current()
        val history = if (cfg.memoryEnabled) c.conversation.recent(cfg.maxHistoryTurns) else emptyList()
        val system = Prompts.persona(
            replyLanguage = cfg.replyLanguage,
            memoryBlock = if (cfg.memoryEnabled) c.memory.promptBlock() else "",
            deviceBlock = deviceContextLine()
        )
        val answer = StringBuilder()
        try {
            val lang = TextNorm.detectLang(utterance)
            set(AssistantState.SPEAKING) // sentences will flow straight to TTS
            val res = c.gemini.chat(
                userText = utterance,
                history = history,
                systemPrompt = system,
                imageJpeg = null,
                useSearch = cfg.searchGrounding && c.net.isOnline(),
                onSentence = { _sentence ->
                    JarvisBus.post(JarvisEvent.JarvisText(_sentence, final = false))
                    c.wake.holdOff(AudioGate.echoGuardMs(_sentence.length))
                    c.tts.enqueueStreamingSentence(_sentence)
                }
            )
            answer.append(res.text)
            val finalText = res.text.ifBlank { "…" }
            JarvisBus.post(JarvisEvent.JarvisText(finalText, final = true))
            if (cfg.memoryEnabled) c.conversation.add("model", finalText)
        } catch (g: GeminiException) {
            speakFailure(g, utterance)
        } catch (t: Throwable) {
            SelfHealing.reportError("chat", t)
            respond("The neural net hiccupped. Try once more?", null, null)
        }
    }

    /** "What's written here / explain this" — screenshot → vision model. */
    private suspend fun visionTurn(question: String, utterance: String) {
        val jpeg = ScreenContext.captureJpeg()
        if (jpeg == null) {
            respond(
                "I can't capture the screen right now. Enable JARVIS in Accessibility settings and try on Android 11 or newer.",
                null, null
            )
            return
        }
        val cfg = settings.current()
        if (!cfg.hasApiKey) {
            // offline graceful: read node text instead
            val text = ScreenContext.visibleText(1200)
            respond(
                text?.replace('\n', ' ')?.take(500)
                    ?: "Screen text needs the Gemini key for visual answers.",
                text, null
            )
            return
        }
        try {
            set(AssistantState.THINKING)
            val answer = c.gemini.describeImage(
                jpeg,
                "$question\n(Screen focus: ${ScreenContext.currentAppLabel()})",
                Prompts.persona(replyLanguage = cfg.replyLanguage) + "\n" + Prompts.screenAssistant()
            )
            respond(Prompts.trimToTokenBudget(answer, 900), answer, null)
            if (cfg.memoryEnabled) c.conversation.add("model", answer)
        } catch (g: GeminiException) {
            speakFailure(g, utterance)
        } catch (t: Throwable) {
            SelfHealing.reportError("vision", t)
            respond("Vision failed mid-flight — text mode may work: say 'read the screen'.", null, null)
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Used by reminders / proactive speech. */
    fun speakOnly(text: String) {
        c.scope.launchSelfHealing("speak-only") { respond(text, null, null) }
    }

    private fun finishWith(speech: String?, showText: String?, followUp: String?) {
        if (!followUp.isNullOrBlank()) followUpContext = followUp
        respond(speech ?: "Done", showText, followUp)
        c.playSfx(Sfx.Cue.SUCCESS)
    }

    private fun respond(speech: String, showText: String?, followUp: String?) {
        JarvisBus.post(JarvisEvent.JarvisText(showText ?: speech, final = true))
        set(AssistantState.SPEAKING)
        c.wake.holdOff(AudioGate.echoGuardMs(speech.length))
        val lang = TextNorm.detectLang(speech)
        c.tts.speak(
            speech,
            langHint = if (settings.current().replyLanguage == "auto") lang else settings.current().replyLanguage
        ) {
            // After the voice finishes, go back to standby.
            JarvisService.instance?.speakTailIdle()
        }
        if (settings.current().memoryEnabled && showText != null && showText != speech) {
            c.conversation.add("model", speech)
        }
    }

    private fun speakFailure(g: GeminiException, utterance: String) {
        JarvisLog.w("gemini failure ${g.failure} during: \"$utterance\"")
        c.playSfx(Sfx.Cue.FAILURE)
        val lang = TextNorm.detectLang(utterance)
        respond(g.speakable(lang) + if (lang == "gu") "…" else ".", null, null)
    }

    private fun keyMissingLine(utterance: String): String = when (TextNorm.detectLang(utterance)) {
        "gu" -> "જાર્વિસની બુદ્ધિ હજી જગાડી નથી — સેટિંગ્સમાં Gemini API કી મૂકો. ત્યાં સુધી ૪૦+ ઑફલાઇન કમાન્ડ્સ ચાલુ છે."
        "hi" -> "मेरा दिमाग जगा नहीं — सेटिंग्स में Gemini API key डालें। तब तक 40+ ऑफ़लाइन कमांड चलते रहेंगे।"
        else -> "My Gemini brain is asleep — add the API key in Settings. Until then, 40+ offline commands work."
    }

    private fun deviceContextLine(): String = runCatching {
        buildString {
            val df = SimpleDateFormat("EEE d MMM yyyy, HH:mm", Locale.ENGLISH)
            appendLine("now=${df.format(Date())}; ${c.router.deviceContext()}")
            val focus = ScreenContext.currentAppLabel()
            if (focus.isNotBlank()) appendLine("currentApp=$focus")
        }.trimEnd()
    }.getOrDefault("")

    private fun set(state: AssistantState, detail: String = "") {
        JarvisBus.post(JarvisEvent.StateChanged(state, detail))
    }

    /** launch with healing wrapper */
    private fun kotlinx.coroutines.CoroutineScope.launchSelfHealing(
        tag: String,
        block: suspend () -> Unit
    ) = kotlinx.coroutines.launch {
        try {
            block()
        } catch (t: Throwable) {
            SelfHealing.reportError(tag, t)
            set(AssistantState.IDLE)
        }
    }

    private suspend fun <T> withTimeoutQuietly(seconds: Long = 45, block: suspend () -> T): T? =
        kotlinx.coroutines.withTimeoutOrNull(seconds * 1000) {
            runCatching { block() }.getOrNull()
        }

}

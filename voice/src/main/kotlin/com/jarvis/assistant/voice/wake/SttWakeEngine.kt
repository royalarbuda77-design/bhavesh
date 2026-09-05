package com.jarvis.assistant.voice.wake

import android.content.Context
import com.jarvis.assistant.core.config.SettingsRepository
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.state.JarvisBus
import com.jarvis.assistant.core.state.JarvisEvent
import com.jarvis.assistant.core.state.NoticeLevel
import com.jarvis.assistant.voice.gate.AudioGate
import com.jarvis.assistant.voice.stt.SttEngine
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Built-in wake engine: [AudioGate] energy gate → short constrained-ASR burst
 * → fuzzy wake validation. No SDKs, no keys, works offline, tolerates the many
 * ways an Indian-accented mic hears "Jarvis" (જારવિસ / jervis / charvis…).
 *
 * The same gate output doubles as the HUD's live microphone level, so this
 * engine *is* the "Always Listening" mode — the service just re-arms it
 * between sessions.
 */
class SttWakeEngine(
    @Suppress("UNUSED_PARAMETER") context: Context,
    private val settings: SettingsRepository,
    private val gate: AudioGate,
    private val stt: SttEngine
) : WakeWordEngine {

    override val name = "gate-stt"
    override var onWake: () -> Unit = {}
    override var onSleepRequested: () -> Unit = {}
    override var onStopSpeaking: () -> Unit = {}
    override var sensitivity: Int = 2
    override var profile = settings.current().powerProfile

    private val armed = AtomicBoolean(false)

    /** Watchdog introspection. */
    val isArmed: Boolean get() = armed.get()
    private val burstRunning = AtomicBoolean(false)
    private val consecutiveFailures = AtomicInteger(0)
    @Volatile private var holdUntil = 0L

    override fun start() {
        if (armed.getAndSet(true)) return
        gate.profile = profile
        gate.listener = gateListener
        runCatching { gate.start() }
            .onFailure { JarvisLog.e("gate start failed — mic permission?", it) }
        if (!stt.isAvailable) {
            JarvisBus.post(
                JarvisEvent.Notice(
                    NoticeLevel.WARN,
                    "No speech-recogniser found — install 'Google app' speech model for wake word. Push-to-talk still works."
                )
            )
        }
    }

    override fun stop() {
        armed.set(false)
        gate.listener = null
        runCatching { stt.cancel() }
        // gate is left running on purpose when LISTENING shares it; service stops it fully.
    }

    /** Fully release the microphone (used by Shutdown/SLEEP mode). */
    fun releaseMic() {
        runCatching { gate.stop() }
    }

    /** Re-acquire the mic (wake mode resume). */
    fun reacquireMic() {
        if (armed.get()) runCatching { gate.start() }
    }

    override fun holdOff(ms: Long) {
        holdUntil = System.currentTimeMillis() + ms
        gate.ignoreUntilMs = holdUntil
    }

    private val gateListener = object : AudioGate.Listener {
        override fun onSpeechStart() {
            if (!armed.get() || burstRunning.get()) return
            if (System.currentTimeMillis() < holdUntil) return
            runBurst()
        }
    }

    private fun runBurst() {
        if (!burstRunning.compareAndSet(false, true)) return
        val cfg = settings.current()
        stt.maxUtteranceMs = 3400
        stt.silenceMs = 1600
        stt.start(
            language = if (cfg.sttLanguage == "auto") null else cfg.sttLanguage,
            phraseList = WakePhrases.grammar(cfg.customWakePhrase),
            cb = burstCallback
        )
    }

    private val burstCallback = object : SttEngine.Callback {
        override fun onFinal(text: String, confidence: Float) {
            val trimmed = text.trim()
            if (trimmed.isBlank()) return
            val cfg = settings.current()
            val minConf = when (sensitivity) {
                1 -> 0.42f
                2 -> 0.30f
                else -> 0.18f
            }

            when {
                WakePhrases.matchesShutdown(trimmed) -> {
                    JarvisLog.i("wake-burst → SHUTDOWN phrase: \"$trimmed\"")
                    holdOff(1_500)
                    onSleepRequested()
                }
                WakePhrases.matchesStopSpeaking(trimmed) -> {
                    JarvisLog.i("wake-burst → STOP phrase")
                    onStopSpeaking()
                }
                WakePhrases.matchesWake(trimmed, cfg.customWakePhrase, sensitivity) && confidence >= minConf -> {
                    JarvisLog.i("wake confirmed: \"$trimmed\" conf=$confidence")
                    consecutiveFailures.set(0)
                    holdOff(2_500)
                    onWake()
                }
                else -> {
                    // heard speech, but it wasn't for us — quick cooldown
                    consecutiveFailures.set(0)
                    holdOff(700)
                }
            }
        }

        override fun onFatalError(code: Int) {
            val fails = consecutiveFailures.incrementAndGet()
            val backoff = (1_000L shl fails.coerceAtMost(4)).coerceAtMost(15_000L)
            JarvisLog.w("wake burst error $code → backoff ${backoff}ms")
            holdOff(backoff)
            if (fails >= 6) {
                JarvisBus.post(
                    JarvisEvent.Notice(NoticeLevel.WARN, "Microphone busy — wake engine self-healing, will keep retrying")
                )
            }
        }

        override fun onEnd() {
            burstRunning.set(false)
        }
    }
}

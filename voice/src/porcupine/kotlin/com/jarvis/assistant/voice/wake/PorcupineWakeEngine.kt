package com.jarvis.assistant.voice.wake

import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import ai.picovoice.porcupine.Porcupine
import com.jarvis.assistant.core.config.SettingsRepository
import com.jarvis.assistant.core.config.PowerProfile
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.nlu.OfflineNlu
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * OPTIONAL backend (not compiled unless -Pjarvis.engines.porcupine=true).
 *
 * Porcupine is ~0.6 % CPU on-device keyword spotting with a dedicated
 * "jarvis" model — the most power-efficient "always listening" option.
 * Needs a (free for personal use) Picovoice AccessKey — see docs/WAKE_WORD.md.
 *
 * After wake, shutdown/stop phrases still run through the ASR pass because
 * Porcupine spots single keywords only — combined strategy: Porcupine arms,
 * SpeechRecognizer verifies phrases.
 */
class PorcupineWakeEngine(
    private val context: Context,
    private val settings: SettingsRepository,
    private val accessKey: String
) : WakeWordEngine {

    override val name = "porcupine"
    override var onWake: () -> Unit = {}
    override var onSleepRequested: () -> Unit = {}
    override var onStopSpeaking: () -> Unit = {}
    override var sensitivity: Int = 2
    override var profile: PowerProfile = PowerProfile.BALANCED

    private var porcupine: Porcupine? = null
    private val running = AtomicBoolean(false)
    @Volatile private var worker: Thread? = null
    @Volatile private var holdUntil = 0L

    override fun start() {
        if (running.getAndSet(true)) return
        porcupine = runCatching {
            Porcupine.Builder()
                .setAccessKey(accessKey)
                .setKeyword("jarvis")                     // built-in model
                .setSensitivity(when (sensitivity) { 1 -> 0.45f; 2 -> 0.65f; else -> 0.8f })
                .build(context)
        }.getOrElse {
            JarvisLog.e("Porcupine init failed — falling back to gate-stt engine", it)
            running.set(false)
            throw IllegalStateException("Porcupine unavailable: ${it.message}")
        }
        worker = thread(name = "jarvis-porcupine") { loop() }
    }

    private fun loop() {
        val frame = Porcupine.getFrameLength()   // typically 512 samples @16 kHz
        val rate = Porcupine.getSampleRate()
        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION, rate,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
            frame * 8
        )
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            JarvisLog.e("Porcupine: AudioRecord failed to init")
            runCatching { record.release() }
            return
        }
        val buffer = ShortArray(frame)
        record.startRecording()
        try {
            while (running.get()) {
                val read = record.read(buffer, 0, buffer.size)
                if (read <= 0) continue
                val index = porcupine?.process(buffer) ?: -1
                if (index >= 0 && System.currentTimeMillis() > holdUntil) {
                    holdUntil = System.currentTimeMillis() + 2_500
                    // post-verify: was it actually the *wake* phrase vs shutdown?
                    val pending = pendingPhrase?.let { OfflineNlu.parse(it) }
                    if (pending != null) {
                        onSleepRequested().also { pendingPhrase = null }
                    } else {
                        onWake()
                    }
                }
            }
        } catch (t: Throwable) {
            JarvisLog.w("porcupine loop crashed", t)
        } finally {
            runCatching { record.stop() }
            runCatching { record.release() }
        }
    }

    /** Filled by the ASR verifier when a command session ends with an
     *  unrecognised tail — used to disambiguate "shutdown jarvis". */
    @Volatile var pendingPhrase: String? = null

    override fun stop() {
        running.set(false)
        worker?.interrupt(); worker = null
        runCatching { porcupine?.delete() }
        porcupine = null
    }

    override fun holdOff(ms: Long) { holdUntil = System.currentTimeMillis() + ms }
}

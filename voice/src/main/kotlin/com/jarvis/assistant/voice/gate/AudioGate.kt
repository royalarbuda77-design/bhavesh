package com.jarvis.assistant.voice.gate

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.annotation.RequiresPermission
import com.jarvis.assistant.core.config.PowerProfile
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.state.JarvisLevels
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.concurrent.thread
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min

/**
 * Battery-friendly "always listening" front-end.
 *
 * The microphone is held by a single cheap AudioRecord loop computing RMS +
 * zero-crossing energy at 100 ms granularity (≈0.4–1.2 % CPU). The expensive
 * speech-recogniser is only spun up when the gate detects speech-like energy —
 * that is the whole trick that makes hands-free wake feasible without eating
 * the battery.
 *
 * Power profiles:
 *  • AGGRESSIVE — gate always open.
 *  • BALANCED   — full duty when screen on / charging; when idle, sleep-windows
 *                 (listen 1.1 s, nap 2.0 s).
 *  • SAVER      — sleep-windows always (listen 0.9 s, nap 3.0 s).
 */
@RequiresPermission(Manifest.permission.RECORD_AUDIO)
class AudioGate(private val context: Context) {

    interface Listener {
        /** Speech-like burst just started. Run STT now. */
        fun onSpeechStart()

        /** Fired continuously (~10 Hz) with normalised level for the HUD. */
        fun onLevel(level: Float) = Unit

        fun onGateFailure(t: Throwable) = Unit
    }

    var listener: Listener? = null
    @Volatile var profile: PowerProfile = PowerProfile.BALANCED
    @Volatile var screenOn: Boolean = true
    @Volatile var charging: Boolean = false

    /** Extra window where the gate ignores detections (echo guard while TTS talks). */
    @Volatile var ignoreUntilMs: Long = 0L

    private val running = AtomicBoolean(false)
    private val lastTrigger = AtomicLong(0L)
    @Volatile private var worker: Thread? = null

    private val sampleRate = 16000
    private val frameSamples = 1600 // 100 ms

    fun start() {
        if (running.getAndSet(true)) return
        worker = thread(name = "jarvis-gate", priority = Thread.NORM_PRIORITY + 1) { loop() }
    }

    fun stop() {
        running.set(false)
        worker?.interrupt()
        worker = null
    }

    val isRunning get() = running.get()

    private fun loop() {
        var record: AudioRecord? = null
        val buf = ShortArray(frameSamples)
        var noiseFloorDb = -42.0
        var speechFrames = 0
        var silenceFrames = 0

        while (running.get()) {
            val now = System.currentTimeMillis()
            try {
                if (!gateAwake(now)) {
                    closeQuietly(record); record = null
                    sleep(dutyNapMs())
                    continue
                }

                if (record == null) record = openRecord() ?: run {
                    // mic busy or permission gone — back off, self-heal
                    closeQuietly(record)
                    sleep(3_000)
                    continue
                }

                val read = record.read(buf, 0, frameSamples)
                if (read <= 0) { sleep(20); continue }

                var sumSq = 0.0
                var zc = 0
                for (i in 0 until read) {
                    val s = buf[i].toDouble()
                    sumSq += s * s
                    if (i > 0 && ((buf[i - 1] >= 0) != (buf[i] >= 0))) zc++
                }
                val rms = kotlin.math.sqrt(sumSq / read)
                val db = if (rms < 1.0) -80.0 else 20.0 * ln(rms) / ln(10.0) - 90.3

                val norm = min(1.0, max(0.0, (rms - 60.0) / 9000.0))
                JarvisLevels.set(norm.toFloat())
                listener?.onLevel(norm.toFloat())

                // adaptive noise floor: slow down, fast up
                noiseFloorDb = if (db < noiseFloorDb) noiseFloorDb * 0.995 + db * 0.005
                else noiseFloorDb * 0.6 + db * 0.4

                val speechish = db > max(-38.0, noiseFloorDb + 7.5) && zc > read / 30 && zc < read / 1.6

                if (speechish) {
                    silenceFrames = 0
                    speechFrames++
                    if (speechFrames >= 2 && now > ignoreUntilMs && now - lastTrigger.get() > 2_600) {
                        lastTrigger.set(now)
                        speechFrames = 0
                        listener?.onSpeechStart()
                    }
                } else {
                    speechFrames = 0
                    if (silenceFrames < 100) silenceFrames++
                }
            } catch (t: Throwable) {
                silenceFrames = 0; speechFrames = 0
                closeQuietly(record); record = null
                JarvisLog.w("gate loop recovered", t)
                SelfHealing.reportError("audio-gate", t)
                listener?.onGateFailure(t)
                sleep(1_500)
            }
        }
        closeQuietly(record)
        JarvisLevels.set(0f)
    }

    private fun gateAwake(now: Long): Boolean = when (profile) {
        PowerProfile.AGGRESSIVE -> true
        PowerProfile.BALANCED -> screenOn || charging || (now % 4_000L) < 1_100L
        PowerProfile.SAVER -> (now % 4_200L) < 900L
    }

    private fun dutyNapMs(): Long = when (profile) {
        PowerProfile.AGGRESSIVE -> 40
        PowerProfile.BALANCED -> if (screenOn || charging) 40 else 2_000
        PowerProfile.SAVER -> 3_300
    }

    private fun openRecord(): AudioRecord? {
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            return null
        val sources = intArrayOf(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.CAMCORDER,
            MediaRecorder.AudioSource.MIC
        )
        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(frameSamples * 4)
        for (src in sources) {
            val rec = SelfHealing.guarded("gate-open", null) {
                @Suppress("MissingPermission")
                AudioRecord(src, sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minBuf * 2)
            } ?: continue
            if (rec.state == AudioRecord.STATE_INITIALIZED) {
                runCatching { rec.startRecording() }.getOrElse {
                    runCatching { rec.release() }
                    continue
                }
                return rec
            }
            runCatching { rec.release() }
        }
        return null
    }

    private fun closeQuietly(r: AudioRecord?) {
        r?.let {
            runCatching { it.stop() }
            runCatching { it.release() }
        }
    }

    private fun sleep(ms: Long) = runCatching { Thread.sleep(ms) }

    companion object {
        /** echo guard helper: seconds of gate suppression for TTS tail + room echo. */
        fun echoGuardMs(ttsChars: Int): Long =
            abs(min(ttsChars, 600)).toLong() // base 1 ms/char
                .let { 700L + it * 6L }      // ≈ (700ms … 4.3s)

        fun smooth(x: Double) = 1.0 - abs(1.0 - x) // kept for future spectral work
    }
}

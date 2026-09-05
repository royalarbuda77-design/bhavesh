package com.jarvis.assistant.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import com.jarvis.assistant.core.healing.SelfHealing
import java.util.concurrent.Executors
import kotlin.concurrent.thread
import kotlin.math.PI
import kotlin.math.sin

/**
 * Procedurally generated UI sounds — Iron-Man style chirps without shipping
 * binary assets. Tiny wavetables rendered with an AudioTrack in static mode.
 */
object Sfx {

    enum class Cue { WAKE, LISTEN_OPEN, LISTEN_CLOSE, SUCCESS, FAILURE, TICK }

    private val pool = Executors.newSingleThreadExecutor { r -> thread(name = "jarvis-sfx", isDaemon = true) { r.run() } }
    private const val RATE = 44100

    fun play(context: Context, cue: Cue, volume: Float = 0.6f) {
        pool.execute {
            SelfHealing.guarded("sfx", null) { render(cue, volume) }
        }
    }

    private fun render(cue: Cue, volume: Float) {
        val segs: List<Triple<Double, Double, Double>> = when (cue) { // from,to,durSec
            Cue.WAKE -> listOf(Triple(520.0, 1040.0, 0.16), Triple(780.0, 1560.0, 0.16))
            Cue.LISTEN_OPEN -> listOf(Triple(880.0, 1320.0, 0.12))
            Cue.LISTEN_CLOSE -> listOf(Triple(1320.0, 760.0, 0.14))
            Cue.SUCCESS -> listOf(Triple(660.0, 990.0, 0.10), Triple(990.0, 1320.0, 0.12))
            Cue.FAILURE -> listOf(Triple(360.0, 190.0, 0.22))
            Cue.TICK -> listOf(Triple(1200.0, 1200.0, 0.03))
        }
        val totalSamples = segs.sumOf { (it.third * RATE).toLong() }.toInt()
        val data = ShortArray(totalSamples)
        var idx = 0
        for ((from, to, dur) in segs) {
            val n = (dur * RATE).toInt()
            for (i in 0 until n) {
                val t = i / RATE
                val f = from + (to - from) * (i.toDouble() / n)
                // short attack/decay envelope to avoid clicks
                val env = kotlin.math.min(1.0, i / (0.02 * RATE)).let { e ->
                    val e2 = kotlin.math.min(1.0, (n - i) / (0.05 * RATE))
                    e * e2
                }
                val s = sin(2 * PI * f * t) * 0.6 + sin(2 * PI * f * 2 * t) * 0.15
                if (idx < totalSamples) data[idx++] = (s * env * volume * Short.MAX_VALUE).toInt().toShort()
            }
        }
        val minBuf = AudioTrack.getMinBufferSize(
            RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(data.size * 2)

        @Suppress("DEPRECATION")
        val track = AudioTrack(
            AudioManager.STREAM_NOTIFICATION,
            RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuf, data.size * 2),
            AudioTrack.MODE_STATIC
        )
        runCatching {
            track.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
        }
        track.write(data, 0, data.size)
        track.setNotificationMarkerPosition(data.size)
        try {
            track.play()
        } catch (t: Throwable) {
            runCatching { track.release() }
        }
        // release after playback via a daemon watchdog (static-mode tracks leak otherwise)
        val ms = (totalSamples.toDouble() / RATE * 1000 + 260).toLong()
        java.util.concurrent.Executors.newSingleThreadScheduledExecutor { r ->
            thread(isDaemon = true) { r.run() }
        }.schedule({ runCatching { track.release() } }, ms, java.util.concurrent.TimeUnit.MILLISECONDS)
    }
}

package com.jarvis.assistant.voice.tts

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.gemini.GeminiClient
import kotlinx.coroutines.delay

/**
 * High-quality neural voice via the Gemini TTS models. Renders a whole
 * sentence to 24 kHz mono PCM and streams it through AudioTrack.
 * Any failure returns false → TtsManager degrades to [SystemTtsEngine]
 * seamlessly (self-healing: user never hears silence).
 */
class GeminiTtsEngine(
    private val client: GeminiClient,
    private val voiceNameProvider: () -> String
) : TtsEngine {

    override val id = "gemini"

    @Volatile private var track: AudioTrack? = null
    @Volatile private var cancelled = false

    override suspend fun speak(text: String, langHint: String?, utteranceId: String): Boolean {
        cancelled = false
        val pcm = runCatching { client.synthesizeSpeech(text, voiceNameProvider()) }
            .onFailure { JarvisLog.w("cloud tts error", it) }
            .getOrNull() ?: return false
        if (cancelled) return true // stop() raced us — report "handled", don't fall back
        return try {
            play(pcm)
            true
        } catch (t: Throwable) {
            JarvisLog.w("cloud tts playback failed", t)
            release()
            false
        }
    }

    private suspend fun play(pcm: GeminiClient.PcmAudio) {
        val bytes = pcm.bytes
        val minBuf = AudioTrack.getMinBufferSize(
            pcm.sampleRateHz, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(4096)
        @Suppress("DEPRECATION")
        val t = AudioTrack(
            AudioManager.STREAM_MUSIC,
            pcm.sampleRateHz,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuf, bytes.size),
            AudioTrack.MODE_STATIC
        )
        runCatching {
            t.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
        }
        t.write(bytes, 0, bytes.size)
        track = t
        t.play()
        val durationMs = (bytes.size.toLong() * 1000L) / (2L * pcm.sampleRateHz)
        var waited = 0L
        while (!cancelled && waited < durationMs + 400) {
            delay(120)
            waited += 120
            val playing = runCatching { t.isPlaying }.getOrDefault(true)
            if (!playing && waited > 600) break
        }
        runCatching { t.stop() }
        runCatching { t.release() }
        track = null
    }

    override fun stopAll() {
        cancelled = true
        track?.let { old ->
            track = null
            runCatching { old.stop() }
            runCatching { old.release() }
        }
    }

    override fun release() = stopAll()
}

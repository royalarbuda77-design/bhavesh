package com.jarvis.assistant.voice.tts

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import com.jarvis.assistant.core.config.SettingsRepository
import com.jarvis.assistant.core.config.TtsBackend
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.state.JarvisBus
import com.jarvis.assistant.core.state.JarvisEvent
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Serialised speech pipeline used by everything (replies, action feedback,
 * wake chimes). Handles:
 *   • audio focus with ducking of the music app
 *   • sentence-level playback (fast first-sound even for long answers)
 *   • cloud→device backend fallback per sentence (never silence, never crash)
 *   • barge-in: stop() kills queue + engine in one call
 */
class TtsManager(
    private val context: Context,
    private val settings: SettingsRepository,
    private val system: SystemTtsEngine,
    private val cloud: GeminiTtsEngine?,
    private val netOnline: () -> Boolean
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default + SelfHealing.handler)
    private val queue = java.util.concurrent.ConcurrentLinkedQueue<String>()
    private val drainJob = AtomicBoolean(false)
    private val gen = AtomicInteger(0)
    private val manager = context.getSystemService(AudioManager::class.java)

    @Volatile private var onSpeakDone: (() -> Unit)? = null
    @Volatile var isSpeaking: Boolean = false
        private set

    init {
        system.prepare()
    }

    /** Speak full reply (queued behind anything still playing). */
    fun speak(text: String, langHint: String? = null, onComplete: (() -> Unit)? = null) {
        val sentences = SentenceSplit.split(text)
        if (sentences.isEmpty()) { onComplete?.invoke(); return }
        langHolder = langHint
        onSpeakDone = onComplete
        queue.addAll(sentences)
        startDrainIfIdle()
    }

    /** Streaming chat: enqueue a sentence as the LLM produces it. */
    fun enqueueStreamingSentence(sentence: String) {
        if (sentence.isBlank()) return
        queue.add(sentence.trim())
        startDrainIfIdle()
    }

    fun markStreamingEnd(onComplete: (() -> Unit)? = null) {
        onComplete?.let { onSpeakDone = it }
    }

    @Volatile private var langHolder: String? = null

    private fun startDrainIfIdle() {
        if (!drainJob.compareAndSet(false, true)) return
        val myGen = gen.get()
        scope.launch {
            try {
                if (!acquireFocus()) JarvisLog.d("tts: audio focus not granted — continuing")
                setSpeaking(true)
                while (queue.isNotEmpty()) {
                    if (myGen != gen.get()) break
                    val sentence = queue.poll() ?: break
                    val ok = speakSentence(sentence, langHolder, "jv-$myGen-${System.nanoTime()}")
                    if (!ok) {
                        // both backends failed — say something, don't die silent
                        JarvisBus.post(JarvisEvent.Notice(com.jarvis.assistant.core.state.NoticeLevel.WARN, "Voice engine unavailable — showing text only"))
                        break
                    }
                }
            } catch (t: Throwable) {
                SelfHealing.reportError("tts-drain", t)
            } finally {
                setSpeaking(false)
                abandonFocus()
                drainJob.set(false)
                if (myGen == gen.get()) {
                    val hook = onSpeakDone
                    onSpeakDone = null
                    hook?.let { runCatching { it() } }
                }
            }
        }
    }

    private suspend fun speakSentence(sentence: String, lang: String?, uid: String): Boolean {
        val cfg = settings.current()
        if (cfg.ttsBackend == TtsBackend.CLOUD_GEMINI && cloud != null && cfg.hasApiKey && netOnline()) {
            val cloudOk = SelfHealing.guardedSuspend("tts-cloud", false) { cloud.speak(sentence, lang, uid) }
            if (cloudOk == true) return true
            JarvisLog.d("cloud tts failed → falling back to device voice")
        }
        val sysOk = SelfHealing.guardedSuspend("tts-system", false) { system.speak(sentence, lang, uid) }
        return sysOk == true
    }

    /** Barge-in / shutdown. Everything flushes instantly. */
    fun stop() {
        gen.incrementAndGet()
        queue.clear()
        onSpeakDone = null
        scope.coroutineContext[Job]?.let { /* scope keeps running; worker loop checks gen */ }
        runCatching { system.stopAll() }
        runCatching { cloud?.stopAll() }
        setSpeaking(false)
        abandonFocus()
        drainJob.set(false)
    }

    fun shutdown() {
        stop()
        scope.cancel()
        system.release()
        runCatching { cloud?.release() }
    }

    fun refreshPersona() = system.refreshPersona()

    private fun setSpeaking(v: Boolean) {
        if (isSpeaking == v) return
        isSpeaking = v
        JarvisBus.post(JarvisEvent.Speaking(v))
    }

    // ── audio focus (ducks music so Jarvis is audible) ──────────────────────
    private var focusRequest: AudioFocusRequest? = null

    private fun acquireFocus(): Boolean {
        val m = manager ?: return false
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener { }
            .build()
        focusRequest = req
        return runCatching { m.requestAudioFocus(req) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED }
            .getOrDefault(false)
    }

    private fun abandonFocus() {
        val m = manager ?: return
        focusRequest?.let { runCatching { m.abandonAudioFocusRequest(it) } }
        focusRequest = null
    }
}

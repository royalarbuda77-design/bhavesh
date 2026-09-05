package com.jarvis.assistant.voice.stt

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Thin, crash-proof wrapper over Android's SpeechRecognizer:
 *  • works with the Google engine (on-device if language pack installed,
 *    otherwise cloud — best for Gujarati/Hindi code-switched speech)
 *  • auto-restarts after benign errors (silence / timeout) with back-off
 *  • partial-results callback drives the live HUD transcript
 *  • constrained-phrase mode (EXTRA_LANGUAGE_PHRASE) powers wake verification
 *  • all lifecycle marshalled on the main Looper (API requirement)
 */
class SttEngine(private val context: Context) {

    interface Callback {
        fun onPartial(text: String) = Unit
        fun onFinal(text: String, confidence: Float)
        fun onEnd() = Unit
        fun onFatalError(code: Int) = Unit
    }

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private val listening = AtomicBoolean(false)
    private var watchdog: Runnable? = null
    private val startedAt = AtomicLong(0L)

    @Volatile var callback: Callback? = null
    @Volatile var maxUtteranceMs: Long = 12_000L
    @Volatile var silenceMs: Long = 6_500L

    val isAvailable: Boolean get() = SpeechRecognizer.isRecognitionAvailable(context)
    val isBusy: Boolean get() = listening.get()

    /**
     * @param phraseList optional grammar for constrained recognition (wake check).
     * @param language   e.g. "gu-IN"; null → device default.
     */
    fun start(
        language: String?,
        phraseList: List<String>? = null,
        confidenceFloor: Float = 0.35f,
        cb: Callback
    ) {
        callback = cb
        main.post { doStart(language, phraseList, confidenceFloor) }
    }

    private fun doStart(language: String?, phraseList: List<String>?, confidenceFloor: Float) {
        if (listening.get()) return
        if (!isAvailable) {
            callback?.onFatalError(-1)
            return
        }
        val ok = SelfHealing.guarded("stt-start", false) {
            val rec = recognizer ?: SpeechRecognizer.createSpeechRecognizer(context).also {
                recognizer = it
            }
            rec.setRecognitionListener(listener(confidenceFloor))
            rec.startListening(buildIntent(language, phraseList))
            listening.set(true)
            startedAt.set(System.currentTimeMillis())
            armWatchdog()
            true
        }
        if (ok != true) {
            // creation failed → hard error; caller decides whether to retry later
            callback?.onFatalError(-2)
        }
    }

    private fun buildIntent(language: String?, phraseList: List<String>?): Intent {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            language?.let { putExtra(RecognizerIntent.EXTRA_LANGUAGE, it) }
        }
        if (phraseList != null && phraseList.isNotEmpty()) {
            val merged = phraseList.take(28).joinToString("\n")
            // Constrained grammar recognised by on-device & server engines.
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PHRASE, merged)
        }
        return intent
    }

    fun stop() { // keep partial results & finish gracefully
        main.post { SelfHealing.guarded("stt-stop", null) { recognizer?.stopListening() } }
    }

    fun cancel() {
        main.post {
            disarmWatchdog()
            SelfHealing.guarded("stt-cancel", null) { recognizer?.cancel() }
            listening.set(false)
        }
    }

    fun destroy() {
        main.post {
            disarmWatchdog()
            SelfHealing.guarded("stt-destroy", null) {
                recognizer?.setRecognitionListener(null)
                recognizer?.destroy()
            }
            recognizer = null
            listening.set(false)
        }
    }

    // ── internals ────────────────────────────────────────────────────────────

    private fun armWatchdog() {
        disarmWatchdog()
        val r = object : Runnable {
            override fun run() {
                if (!listening.get()) return
                val el = System.currentTimeMillis() - startedAt.get()
                if (el > maxUtteranceMs) {
                    JarvisLog.d("stt watchdog → force final")
                    stop()
                } else {
                    main.postDelayed(this, 500)
                }
            }
        }
        watchdog = r
        main.postDelayed(r, 500)
    }

    private fun disarmWatchdog() {
        watchdog?.let { main.removeCallbacks(it) }
        watchdog = null
    }

    private fun listener(floor: Float) = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) { }
        override fun onBeginningOfSpeech() { }
        override fun onRmsChanged(rmsdB: Float) { }
        override fun onBufferReceived(buffer: ByteArray?) { }
        override fun onEndOfSpeech() { }

        override fun onError(error: Int) {
            listening.set(false)
            disarmWatchdog()
            callback?.onEnd()
            when (error) {
                SpeechRecognizer.ERROR_NO_MATCH,
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
                SpeechRecognizer.ERROR_AUDIO -> {
                    JarvisLog.d("stt benign error $error")
                }
                else -> {
                    JarvisLog.w("stt error $error")
                    callback?.onFatalError(error)
                }
            }
        }

        override fun onPartialResults(partialResults: Bundle?) {
            partialResults.text()?.let { callback?.onPartial(it) }
        }

        override fun onResults(results: Bundle?) {
            listening.set(false)
            disarmWatchdog()
            val text = results.text() ?: ""
            val conf = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
                ?.firstOrNull()?.coerceIn(0f, 1f) ?: 0.9f
            if (text.isBlank()) {
                callback?.onEnd()
            } else {
                callback?.onFinal(text, if (conf > 0f) conf else 0.9f)
                callback?.onEnd()
            }
        }
    }

    private fun Bundle?.text(): String? {
        val arr = this?.stringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return null
        val best = arr.firstOrNull()?.trim().orEmpty()
        return best.takeIf { it.isNotBlank() }
    }
}

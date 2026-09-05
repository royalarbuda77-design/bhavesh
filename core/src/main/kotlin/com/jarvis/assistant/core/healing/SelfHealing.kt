package com.jarvis.assistant.core.healing

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.state.JarvisBus
import com.jarvis.assistant.core.state.NoticeLevel
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.min
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.delay

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SELF-HEALING ERROR HANDLER
 * ═══════════════════════════════════════════════════════════════════════════
 * Philosophy: a voice assistant that crashes is useless; one that quietly
 * repairs itself is magic. Layers:
 *
 *  1. `guarded { }`       — per-call try/catch that converts exceptions into
 *                           user-safe fallback results + a HEALED notice on the bus.
 *  2. `retry { }`         — exponential backoff for anything network/audio-flaky.
 *  3. CoroutineException  — supervisor handler: logs, notifies, never kills scope.
 *  4. Uncaught (JVM)      — diagnostics are persisted; the service is rescheduled
 *                           via AlarmManager ("crash → auto relaunch"), with a
 *                           crash-storm circuit breaker that enters SAFE MODE.
 *  5. Watchdog            — heartbeat + restart counter used by JarvisService to
 *                           revive a wedged engine without a crash at all.
 * ═══════════════════════════════════════════════════════════════════════════
 */
object SelfHealing {

    private const val SAFE_FILE = "healing_state.json"
    private const val CRASH_FILE = "last_crash.txt"
    private const val STORM_WINDOW_MS = 2 * 60_000L
    private const val STORM_LIMIT = 3

    private lateinit var appContext: Context
    private val crashTimes = ArrayDeque<Long>()
    private val df = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)

    @Volatile var lastError: String? = null
        private set

    fun init(context: Context) {
        appContext = context.applicationContext
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            runCatching { handleUncaught(thread, throwable) }
            // Chain to the original handler (dialog/logcat) after persisting evidence.
            originalHandler?.uncaughtException(thread, throwable)
        }
    }

    private var originalHandler: Thread.UncaughtExceptionHandler? = null

    /** Call from Application.attachBaseContext-ish; stores the platform handler first. */
    fun capturePlatformHandler() {
        originalHandler = Thread.getDefaultUncaughtExceptionHandler()
    }

    /**
     * Execute [block]; on failure log, broadcast a HEALED notice and return [fallback].
     * This is the workhorse wrapper — every hardware/API call should go through it.
     */
    inline fun <T> guarded(tag: String, fallback: T? = null, block: () -> T): T? =
        try {
            block()
        } catch (t: Throwable) {
            SelfHealing.reportError(tag, t)
            fallback
        }

    /** Suspend-friendly twin of [guarded]. */
    suspend fun <T> guardedSuspend(tag: String, fallback: T? = null, block: suspend () -> T): T? =
        try {
            block()
        } catch (t: Throwable) {
            reportError(tag, t)
            fallback
        }

    /** Retry with capped exponential backoff. Throws only after the final attempt. */
    suspend fun <T> retry(
        tag: String,
        attempts: Int = 3,
        baseDelayMs: Long = 400,
        maxDelayMs: Long = 4_000,
        shouldRetry: (Throwable) -> Boolean = { true },
        block: suspend (attempt: Int) -> T
    ): T {
        var last: Throwable? = null
        repeat(attempts) { attempt ->
            try {
                return block(attempt + 1)
            } catch (t: Throwable) {
                last = t
                reportError("$tag (attempt ${attempt + 1}/$attempts)", t, broadcast = false)
                if (attempt == attempts - 1 || !shouldRetry(t)) throw t
                delay(min(baseDelayMs * (1L shl attempt), maxDelayMs))
            }
        }
        throw last ?: IllegalStateException("$tag failed")
    }

    /** Exception handler for every CoroutineScope in the app. */
    val handler: CoroutineExceptionHandler = CoroutineExceptionHandler { _, t ->
        reportError("coroutine", t)
    }

    fun reportError(tag: String, t: Throwable, broadcast: Boolean = true) {
        lastError = "$tag → ${t.javaClass.simpleName}: ${t.message}"
        JarvisLog.w("[$tag] recovered from ${t.javaClass.simpleName}: ${t.message}", t)
        if (broadcast) {
            JarvisBus.post(
                JarvisBusEventHealer.healNotice(tag, t)
            )
        }
    }

    /** Soft user-visible notice (no exception involved). */
    fun notice(message: String, level: NoticeLevel = NoticeLevel.INFO) {
        JarvisBus.post(JarvisBusEventHealer.notice(level, message))
    }

    private fun handleUncaught(thread: Thread, t: Throwable) {
        val now = System.currentTimeMillis()
        crashTimes.addLast(now)
        while (crashTimes.isNotEmpty() && now - crashTimes.first() > STORM_WINDOW_MS) crashTimes.removeFirst()

        val report = buildString {
            appendLine("── JARVIS uncaught exception ──")
            appendLine("time  : ${df.format(Date(now))}")
            appendLine("thread: ${thread.name}")
            appendLine("stack :")
            appendLine(t.stackTraceToString().take(6000))
            appendLine("recent log:")
            JarvisLog.tail(n = 40).forEach { appendLine("  $it") }
        }
        runCatching { File(appContext.filesDir, CRASH_FILE).writeText(report) }
        JarvisLog.e("uncaught on ${thread.name}: ${t.message}", t)

        if (crashTimes.size >= STORM_LIMIT) {
            markSafeMode(true)
            JarvisLog.w("crash storm detected → SAFE MODE (no auto-relaunch)")
        } else {
            markSafeMode(false)
            scheduleRestart()
        }
    }

    /**
     * Set by :app at startup — reschedules a cold restart through AlarmManager.
     * Even if the process dies, the whole foreground service + wake engine come
     * back within a few seconds (crash → auto relaunch).
     */
    @Volatile
    var restartStrategy: (() -> Unit)? = null

    private fun scheduleRestart() {
        runCatching { restartStrategy?.invoke() }
    }

    fun inSafeMode(): Boolean =
        runCatching {
            File(appContext.filesDir, SAFE_FILE).readText().contains("\"safeMode\":true")
        }.getOrDefault(false)

    private fun markSafeMode(on: Boolean) {
        runCatching { File(appContext.filesDir, SAFE_FILE).writeText("{\"safeMode\":$on}") }
    }

    /** UI can offer a one-tap "repair & retry" that clears the breaker. */
    fun clearSafeMode() = markSafeMode(false)

    // ── Watchdog ────────────────────────────────────────────────────────────
    /** Engines heartbeat here; JarvisService's watchdog coroutine revives stalls. */
    @Volatile var lastHeartbeat: Long = System.currentTimeMillis()
        private set

    fun beat() { lastHeartbeat = System.currentTimeMillis() }
    fun stalledFor(ms: Long = 45_000): Boolean = System.currentTimeMillis() - lastHeartbeat > ms
}

/** Small indirection so `guarded` stays inline while events route through JarvisBus. */
internal object JarvisBusEventHealer {
    fun healNotice(tag: String, t: Throwable) =
        com.jarvis.assistant.core.state.JarvisEvent.Notice(
            NoticeLevel.HEALED,
            "Self-healing: [$tag] ${t.javaClass.simpleName} — auto-recovered"
        )

    fun notice(level: NoticeLevel, message: String) =
        com.jarvis.assistant.core.state.JarvisEvent.Notice(level, message)
}

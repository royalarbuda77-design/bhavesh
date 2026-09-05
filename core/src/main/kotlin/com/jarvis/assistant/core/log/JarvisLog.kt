package com.jarvis.assistant.core.log

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.Executors
import kotlin.concurrent.thread

/**
 * Ring-buffered logger that also persists to app-private storage so the
 * in-app Diagnostics screen can show (and export) what happened, even after
 * a restart. Never throws, never blocks the caller (writes queue to a daemon).
 */
object JarvisLog {

    private const val TAG = "Jarvis"
    private const val RING_CAPACITY = 600
    private const val MAX_FILE_BYTES = 4L * 1024 * 1024

    private val ring = ArrayBlockingQueue<String>(RING_CAPACITY)
    private val stamp = SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US)

    private var logFile: File? = null
    private val io = Executors.newSingleThreadExecutor { r ->
        thread(name = "jarvis-log", isDaemon = true) { r.run() }
    }
    @Volatile private var verboseFileLogging = true

    fun attach(context: Context) {
        runCatching {
            val dir = File(context.filesDir, "logs").apply { mkdirs() }
            logFile = File(dir, "jarvis-${SimpleDateFormat("yyyyMMdd", Locale.US).format(Date())}.log")
        }
    }

    fun d(msg: String) = log('D', msg, null)
    fun i(msg: String) = log('I', msg, null)
    fun w(msg: String, t: Throwable? = null) = log('W', msg, t)
    fun e(msg: String, t: Throwable? = null) = log('E', msg, t)

    private fun log(level: Char, msg: String, t: Throwable?) {
        val line = "${stamp.format(Date())} $level $msg" +
            (t?.let { "\n   ↳ ${it.javaClass.simpleName}: ${it.message}" } ?: "")
        ring.offer(line)
        when (level) {
            'E' -> Log.e(TAG, msg, t)
            'W' -> Log.w(TAG, msg, t)
            else -> Log.i(TAG, msg)
        }
        val f = logFile ?: return
        if (verboseFileLogging) {
            io.execute {
                runCatching {
                    if (f.length() > MAX_FILE_BYTES) f.delete()
                    f.appendText(line + "\n")
                }
            }
        }
    }

    /** Everything currently held in memory (oldest → newest). */
    fun snapshot(): List<String> = ring.toList()

    /** Newest entries with a matching needle (used by Diagnostics & self-healing reports). */
    fun tail(matching: String? = null, n: Int = 80): List<String> =
        ring.toList().asReversed()
            .let { list -> matching?.let { m -> list.filter { it.contains(m, ignoreCase = true) } } ?: list }
            .take(n)

    fun shutdown() {
        runCatching { io.shutdown() }
    }
}

package com.jarvis.assistant.automation.utilities

import android.app.ActivityManager
import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.os.SystemClock
import com.jarvis.assistant.automation.system.ExecOutcome
import com.jarvis.assistant.core.util.NetworkMonitor
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Battery / storage / memory / device briefings — all offline, zero-permission. */
class DeviceReport(
    private val context: Context,
    private val net: NetworkMonitor
) {

    private val df = SimpleDateFormat("EEEE, d MMMM, h:mm a", Locale.getDefault())

    fun topic(topic: String): ExecOutcome = when (topic.lowercase()) {
        "battery" -> ExecOutcome(true, battery())
        "storage" -> ExecOutcome(true, storage())
        "memory", "ram" -> ExecOutcome(true, memory())
        "network" -> ExecOutcome(true, network())
        "device" -> ExecOutcome(true, device())
        "time", "date" -> ExecOutcome(true, "Right now it's ${df.format(Date())}")
        else -> ExecOutcome(true, "$battery  $storage")
    }

    /** One-liner injected into the LLM context so answers feel present. */
    fun contextLine(): String = "$battery · $storage · $network"

    val battery: String
        get() = run {
            val bm = context.getSystemService(BatteryManager::class.java)
            val intent = runCatching {
                context.registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            }.getOrNull()
            if (bm == null || intent == null) return@run "Battery status unavailable"
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            val pct = if (level >= 0) level * 100 / scale.coerceAtLeast(1) else -1
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL
            val plugged = when (intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)) {
                BatteryManager.BATTERY_PLUGGED_AC -> "AC"
                BatteryManager.BATTERY_PLUGGED_USB -> "USB"
                BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
                else -> null
            }
            val temp = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1)
            buildString {
                if (pct >= 0) append("Battery at $pct percent")
                if (charging) append(", charging").let { plugged?.let { p -> append(" via $p") } }
                else append(", not charging")
                if (temp > 0) append(", temperature ${(temp / 10.0)}°C")
            }
        }

    val storage: String
        get() = runCatching {
            val stat = StatFs(Environment.getDataDirectory().path)
            val freeGb = stat.availableBytes / 1_073_741_824.0
            val totalGb = stat.totalBytes / 1_073_741_824.0
            "Storage: %.1f GB free of %.0f GB (%.0f%% used)".format(
                freeGb, totalGb, (totalGb - freeGb) * 100.0 / totalGb.coerceAtLeast(0.01)
            )
        }.getOrDefault("Storage info unavailable")

    val memory: String
        get() = runCatching {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
            val freeMb = mi.availMem / 1_048_576
            "Memory: ${freeMb}MB free" + if (mi.lowMemory) " — system is low on RAM" else ""
        }.getOrDefault("Memory info unavailable")

    val network: String
        get() = if (net.isOnline()) "Internet connected (${if (net.isMetered()) "mobile data" else "Wi-Fi"})"
        else "Offline — no internet"

    val device: String
        get() = runCatching {
            val up = SystemClock.elapsedRealtime() / 1000 / 60
            buildString {
                append(Build.MANUFACTURER).append(' ').append(Build.MODEL)
                append(", Android ").append(Build.VERSION.RELEASE)
                append(" (API ").append(Build.VERSION.SDK_INT).append(")")
                append(", up ${up}min")
            }
        }.getOrDefault("Device info unavailable")
}

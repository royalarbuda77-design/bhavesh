package com.jarvis.assistant.automation.utilities

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.AlarmClock
import com.jarvis.assistant.automation.system.ExecOutcome
import com.jarvis.assistant.core.log.JarvisLog

/**
 * Alarms & timers via the Clock app's public intents (the compliant route —
 * third-party apps may not touch the system alarm database directly).
 */
class ClockController(private val context: Context) {

    fun setAlarm(hour: Int, minute: Int, label: String?, expectActivity: Boolean = true): ExecOutcome {
        val intent = Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, hour.coerceIn(0, 23))
            .putExtra(AlarmClock.EXTRA_MINUTES, minute.coerceIn(0, 59))
            .putExtra(AlarmClock.EXTRA_SKIP_UI, false)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !label.isNullOrBlank()) {
            intent.putExtra(AlarmClock.EXTRA_MESSAGE, label)
        } else if (!label.isNullOrBlank()) {
            intent.putExtra(AlarmClock.EXTRA_MESSAGE, label)
        }
        return fire(intent, "Alarm set for %02d:%02d".format(hour, minute), "the Clock app")
    }

    fun dismissAlarm(): ExecOutcome =
        fire(Intent(AlarmClock.ACTION_DISMISS_ALARM).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            "Dismissing the alarm", "the Clock app")

    fun snoozeAlarm(): ExecOutcome =
        fire(Intent(AlarmClock.ACTION_SNOOZE_ALARM).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            "Snoozed", "the Clock app")

    fun showAlarms(): ExecOutcome =
        fire(Intent(AlarmClock.ACTION_SHOW_ALARMS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            "Showing your alarms", "the Clock app")

    fun setTimer(seconds: Int): ExecOutcome {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return ExecOutcome(false, "Timer control needs Android 8+ on this device")
        }
        val intent = Intent(AlarmClock.ACTION_SET_TIMER)
            .putExtra(AlarmClock.EXTRA_LENGTH, seconds.coerceIn(1, 24 * 3600))
            .putExtra(AlarmClock.EXTRA_SKIP_UI, false)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val mins = seconds / 60
        val sec = seconds % 60
        return fire(intent, "Timer started for ${if (mins > 0) "$mins minutes" else ""}${if (sec > 0) " $sec seconds" else ""}".trim(), "the Clock app")
    }

    fun stopTimer(): ExecOutcome =
        fire(Intent(AlarmClock.ACTION_STOP_TIMER).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            "Timer stopped", "the Clock app")

    fun stopwatch(): ExecOutcome =
        fire(Intent(AlarmClock.ACTION_START_STOPWATCH).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            "Stopwatch started", "the Clock app")

    private fun fire(intent: Intent, okMsg: String, fallbackName: String): ExecOutcome =
        runCatching {
            context.startActivity(intent)
            ExecOutcome(true, okMsg)
        }.getOrElse { t ->
            JarvisLog.w("clock intent failed", t)
            // Last resort: at least open the clock app itself
            val alt = runCatching {
                context.packageManager.getLaunchIntentForPackage("com.google.android.deskclock")?.let {
                    it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(it)
                    true
                } ?: false
            }.getOrDefault(false)
            if (alt) ExecOutcome(true, "$fallbackName does not accept voice control here, so I opened it — set it manually.")
            else ExecOutcome(false, "No app on this phone accepts '$fallbackName' voice commands")
        }
}

/**
 * Jarvis-owned local reminders: AlarmManager → notification + spoken alert.
 * Works with zero special permissions (setAndAllowWhileIdle; ±few-min accuracy
 * under Doze, exact alarms optional & auto-downgraded).
 */
data class Reminder(
    val id: Int,
    val text: String,
    val timeMillis: Long
) {
    fun toJson(): String = """{"id":$id,"text":"${text.replace("\"", "\\\"")}","timeMillis":$timeMillis}"""

    companion object {
        private val idRegex = Regex(""""id":(\d+)""")
        private val textRegex = Regex(""""text":"((?:[^"\\]|\\.)*)"""")
        private val timeRegex = Regex(""""timeMillis":(\d+)""")

        fun fromJson(line: String): Reminder? {
            val id = idRegex.find(line)?.groupValues?.get(1)?.toIntOrNull() ?: return null
            val text = textRegex.find(line)?.groupValues?.get(1)?.replace("\\\"", "\"") ?: return null
            val t = timeRegex.find(line)?.groupValues?.get(1)?.toLongOrNull() ?: return null
            return Reminder(id, text, t)
        }
    }
}

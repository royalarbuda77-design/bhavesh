package com.jarvis.assistant.automation.utilities

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.jarvis.assistant.automation.system.ExecOutcome
import com.jarvis.assistant.core.log.JarvisLog
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

/** JSON-file backed reminder store + AlarmManager scheduling + fire receiver. */
class ReminderStore(context: Context) {
    private val file = File(context.filesDir, "memory/reminders.json").apply { parentFile?.mkdirs() }
    private val _reminders = MutableStateFlow(load())
    val reminders: StateFlow<List<Reminder>> = _reminders.asStateFlow()

    @Synchronized
    fun add(text: String, timeMillis: Long): Reminder {
        val nextId = (_reminders.value.maxOfOrNull { it.id } ?: 0) + 1
        val r = Reminder(nextId, text, timeMillis)
        save(_reminders.value + r)
        return r
    }

    @Synchronized
    fun cancel(id: Int): Boolean {
        val removed = _reminders.value.any { it.id == id }
        if (removed) save(_reminders.value.filterNot { it.id == id })
        return removed
    }

    @Synchronized
    fun nextUpcoming(): Reminder? =
        _reminders.value.filter { it.timeMillis > System.currentTimeMillis() }.minByOrNull { it.timeMillis }

    fun all(): List<Reminder> = _reminders.value.sortedBy { it.timeMillis }

    fun formatList(): String {
        val df = SimpleDateFormat("d MMM, h:mm a", Locale.getDefault())
        val upcoming = all().filter { it.timeMillis > System.currentTimeMillis() }
        if (upcoming.isEmpty()) return "No pending reminders"
        return upcoming.joinToString("; ") { "${it.text} at ${df.format(Date(it.timeMillis))}" }
    }

    private fun load(): List<Reminder> = runCatching {
        if (!file.exists()) return@runCatching emptyList()
        val arr = JSONArray(file.readText())
        (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            Reminder(o.getInt("id"), o.getString("text"), o.getLong("timeMillis"))
        }
    }.getOrElse { listOf() }

    private fun save(list: List<Reminder>) {
        runCatching {
            val arr = JSONArray()
            list.forEach { r ->
                arr.put(JSONObject().put("id", r.id).put("text", r.text).put("timeMillis", r.timeMillis))
            }
            file.writeText(arr.toString())
            _reminders.value = list
        }.onFailure { JarvisLog.w("reminder save failed", it) }
    }
}

class ReminderScheduler(private val context: Context, private val store: ReminderStore) {

    fun schedule(r: Reminder) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = pending(r.id)
        runCatching {
            val trigger = maxOf(r.timeMillis, System.currentTimeMillis() + 5_000)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi)
            }
            JarvisLog.i("reminder #${r.id} scheduled at ${Date(trigger)}")
        }.onFailure { JarvisLog.w("reminder schedule failed", it) }
    }

    fun cancel(id: Int) {
        runCatching {
            context.getSystemService(AlarmManager::class.java)?.cancel(pending(id))
        }
    }

    /** Boot/reschedule pass — pending reminders survive reboot. */
    fun rescheduleAll() {
        store.all().filter { it.timeMillis > System.currentTimeMillis() }
            .forEach { schedule(it) }
    }

    private fun pending(id: Int): PendingIntent {
        val intent = Intent(ACTION_FIRED).setPackage(context.packageName).putExtra("id", id)
        return PendingIntent.getBroadcast(
            context, 7000 + id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    companion object {
        const val ACTION_FIRED = "com.jarvis.assistant.action.REMINDER_FIRED"
        const val CHANNEL_ID = "jarvis_reminders"
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra("id", -1)
        val reminder = runCatching {
            File(context.filesDir, "memory/reminders.json").let { f ->
                if (!f.exists()) return
                val arr = JSONArray(f.readText())
                (0 until arr.length())
                    .map { arr.getJSONObject(it) }
                    .firstOrNull { it.getInt("id") == id }
                    ?.let { Reminder(it.getInt("id"), it.getString("text"), it.getLong("timeMillis")) }
            }
        }.getOrNull()
        val text = reminder?.text ?: "Reminder"
        // Remove fired reminder from store (keep past-day entries pruned)
        runCatching {
            val f = File(context.filesDir, "memory/reminders.json")
            if (f.exists()) {
                val arr = JSONArray(f.readText())
                val out = JSONArray()
                val now = System.currentTimeMillis()
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    if (o.getInt("id") != id && o.getLong("timeMillis") > now - 3600_000) out.put(o)
                }
                f.writeText(out.toString())
            }
        }

        ensureChannel(context)
        val nm = context.getSystemService(NotificationManager::class.java)
        val notif = NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Jarvis reminder")
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .build()
        nm?.notify(9000 + id, notif)

        // Ask the running assistant service to speak it too (no-op if asleep)
        runCatching {
            context.startService(
                Intent("com.jarvis.assistant.action.SPEAK")
                    .setPackage(context.packageName)
                    .putExtra("text", "Reminder: $text")
            )
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(NotificationManager::class.java) ?: return
            if (nm.getNotificationChannel(ReminderScheduler.CHANNEL_ID) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(
                        ReminderScheduler.CHANNEL_ID, "Reminders",
                        NotificationManager.IMPORTANCE_HIGH
                    ).apply { description = "Jarvis reminders" }
                )
            }
        }
    }
}

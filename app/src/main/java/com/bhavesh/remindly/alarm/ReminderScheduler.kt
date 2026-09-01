package com.bhavesh.remindly.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.bhavesh.remindly.BuildConfig
import com.bhavesh.remindly.data.ReminderEntity
import com.bhavesh.remindly.data.ReminderRepository
import com.bhavesh.remindly.data.RepeatType
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** AlarmManager is the source of truth for user-facing events; no UI timer is used. */
class ReminderScheduler(
    private val context: Context,
    private val repository: ReminderRepository
) {
    private val alarmManager = context.getSystemService(AlarmManager::class.java)

    suspend fun schedule(reminder: ReminderEntity): Long? = withContext(Dispatchers.IO) {
        if (!reminder.enabled || reminder.completed) {
            cancel(reminder.id)
            return@withContext null
        }
        val triggerAt = ReminderTimes.nextTrigger(reminder, Instant.now()) ?: run {
            cancel(reminder.id)
            // A non-recurring reminder in the past remains visible in calendar
            // history, but is no longer an active alarm candidate.
            if (RepeatType.from(reminder.repeatType) == RepeatType.NEVER && reminder.enabled) {
                repository.update(reminder.copy(enabled = false, nextTriggerAt = null, updatedAt = System.currentTimeMillis()))
            }
            return@withContext null
        }
        cancel(reminder.id)
        val leadTimes = reminder.leadMinutes.split(",").mapNotNull { it.trim().toLongOrNull() }.filter { it >= 0 }.distinct().ifEmpty { listOf(0L) }
        leadTimes.forEach { lead ->
            val alertAt = triggerAt - lead * 60_000L
            if (alertAt > System.currentTimeMillis()) scheduleAt(reminder.id, alertAt, lead)
        }
        if (reminder.nextTriggerAt != triggerAt) {
            repository.update(reminder.copy(nextTriggerAt = triggerAt, updatedAt = System.currentTimeMillis()))
        }
        triggerAt
    }

    suspend fun scheduleAt(reminderId: Long, triggerAt: Long, leadMinutes: Long = 0L) = withContext(Dispatchers.IO) {
        val pendingIntent = pendingIntent(reminderId, leadMinutes)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarmManager.canScheduleExactAlarms()) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
            } else {
                // The fallback still wakes from Doze, but Android may coalesce it. The UI
                // explains how to grant precise alarm access when exact timing matters.
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
            }
        } catch (security: SecurityException) {
            // Permission can be revoked between the check and the call. Keep the
            // reminder in Room; the next resume/boot retry is safe.
            if (BuildConfig.DEBUG) Log.w("Remindly", "Unable to schedule reminder $reminderId", security)
        }
    }

    fun cancel(reminderId: Long) {
        // Cancel all supported lead-time identities. Custom lead times are also
        // superseded the next time the reminder is scheduled.
        listOf(0L, 5L, 10L, 15L, 30L, 60L, 120L, 1440L).forEach { lead -> alarmManager.cancel(pendingIntent(reminderId, lead)) }
    }

    suspend fun rescheduleAll() = withContext(Dispatchers.IO) {
        repository.active().forEach { schedule(it) }
    }

    private fun pendingIntent(id: Long, leadMinutes: Long = 0L): PendingIntent {
        val intent = Intent(context, ReminderAlarmReceiver::class.java)
            .setAction(ACTION_FIRE)
            .putExtra(EXTRA_REMINDER_ID, id)
            .putExtra(EXTRA_LEAD_MINUTES, leadMinutes)
        return PendingIntent.getBroadcast(
            context,
            requestCode(id, leadMinutes),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    companion object {
        const val ACTION_FIRE = "com.bhavesh.remindly.action.FIRE_REMINDER"
        const val EXTRA_REMINDER_ID = "reminder_id"
        const val EXTRA_LEAD_MINUTES = "lead_minutes"
        fun requestCode(id: Long, leadMinutes: Long = 0L) = ((id xor (id ushr 32)) * 31L + leadMinutes).toInt()
    }
}

object ReminderTimes {
    fun zone(reminder: ReminderEntity): ZoneId = runCatching { ZoneId.of(reminder.timezone) }
        .getOrDefault(ZoneId.systemDefault())

    fun original(reminder: ReminderEntity): ZonedDateTime {
        val date = java.time.LocalDate.ofEpochDay(reminder.dateEpochDay)
        val time = java.time.LocalTime.of(reminder.timeMinutes / 60, reminder.timeMinutes % 60)
        return ZonedDateTime.of(LocalDateTime.of(date, time), zone(reminder))
    }

    fun nextTrigger(reminder: ReminderEntity, now: Instant): Long? {
        var occurrence = original(reminder)
        if (occurrence.toInstant().isAfter(now)) return occurrence.toInstant().toEpochMilli()
        val interval = reminder.repeatInterval.coerceAtLeast(1).toLong()
        when (RepeatType.from(reminder.repeatType)) {
            RepeatType.NEVER -> return null
            RepeatType.DAILY -> while (!occurrence.toInstant().isAfter(now)) occurrence = occurrence.plusDays(interval)
            RepeatType.WEEKLY -> while (!occurrence.toInstant().isAfter(now)) occurrence = occurrence.plusWeeks(interval)
            RepeatType.MONTHLY -> while (!occurrence.toInstant().isAfter(now)) occurrence = occurrence.plusMonths(interval)
            RepeatType.YEARLY -> while (!occurrence.toInstant().isAfter(now)) occurrence = occurrence.plusYears(interval)
        }
        return occurrence.toInstant().toEpochMilli()
    }
}

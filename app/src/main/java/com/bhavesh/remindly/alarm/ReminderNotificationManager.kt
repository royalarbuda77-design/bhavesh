package com.bhavesh.remindly.alarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.bhavesh.remindly.MainActivity
import com.bhavesh.remindly.R
import com.bhavesh.remindly.data.AlertType
import com.bhavesh.remindly.data.ReminderEntity
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

class ReminderNotificationManager(private val context: Context) {
    private val manager = context.getSystemService(NotificationManager::class.java)

    fun createChannels() {
        val defaults = listOf(
            Triple(CHANNEL_IMPORTANT, context.getString(R.string.notification_channel_important), NotificationManager.IMPORTANCE_HIGH),
            Triple(CHANNEL_NORMAL, context.getString(R.string.notification_channel_normal), NotificationManager.IMPORTANCE_DEFAULT),
            Triple(CHANNEL_SILENT, context.getString(R.string.notification_channel_silent), NotificationManager.IMPORTANCE_LOW)
        )
        defaults.forEach { (id, name, importance) ->
            val channel = NotificationChannel(id, name, importance).apply {
                description = context.getString(R.string.notification_channel_description)
                if (id != CHANNEL_SILENT) {
                    enableVibration(true)
                    setSound(Settings.System.DEFAULT_NOTIFICATION_URI, AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build())
                }
            }
            manager.createNotificationChannel(channel)
        }
    }

    fun show(reminder: ReminderEntity, leadMinutes: Long = 0L) {
        createChannels()
        val detailsIntent = PendingIntent.getActivity(
            context, reminder.id.hashCode(),
            Intent(context, MainActivity::class.java).putExtra(ReminderScheduler.EXTRA_REMINDER_ID, reminder.id)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val doneIntent = actionIntent(reminder.id, ReminderActionReceiver.ACTION_DONE)
        val snoozeIntent = actionIntent(reminder.id, ReminderActionReceiver.ACTION_SNOOZE)
        val fullScreenIntent = PendingIntent.getActivity(
            context, (reminder.id.hashCode() + 1),
            Intent(context, AlarmActivity::class.java).putExtra(ReminderScheduler.EXTRA_REMINDER_ID, reminder.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val channel = when (AlertType.from(reminder.alertType)) {
            AlertType.SILENT -> CHANNEL_SILENT
            AlertType.ALARM, AlertType.SOUND, AlertType.VIBRATE -> CHANNEL_IMPORTANT
            AlertType.NOTIFICATION -> CHANNEL_NORMAL
        }
        val dateTime = Instant.ofEpochMilli(reminder.nextTriggerAt ?: System.currentTimeMillis())
            .atZone(ReminderTimes.zone(reminder)).format(DateTimeFormatter.ofPattern("EEE, d MMM • h:mm a", Locale.getDefault()))
        val builder = NotificationCompat.Builder(context, channel)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(reminder.title)
            .setContentText(if (leadMinutes > 0) "In $leadMinutes minutes  •  $dateTime" else reminder.description.ifBlank { dateTime })
            .setSubText(dateTime)
            .setStyle(NotificationCompat.BigTextStyle().bigText(reminder.description.ifBlank { "Your scheduled reminder is ready." }))
            .setContentIntent(detailsIntent)
            .setAutoCancel(true)
            .setGroup(GROUP_REMINDERS)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(if (channel == CHANNEL_IMPORTANT) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .addAction(android.R.drawable.checkbox_on_background, "Done", doneIntent)
            .addAction(android.R.drawable.ic_lock_idle_alarm, "Snooze ${reminder.snoozeDuration}m", snoozeIntent)
        if (channel == CHANNEL_IMPORTANT) builder.setFullScreenIntent(fullScreenIntent, true)
        if (reminder.vibration && channel != CHANNEL_SILENT) builder.setVibrate(longArrayOf(0, 220, 120, 220))
        runCatching { NotificationManagerCompat.from(context).notify(reminder.id.toInt(), builder.build()) }
        runCatching { NotificationManagerCompat.from(context).notify(SUMMARY_ID, NotificationCompat.Builder(context, channel)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Remindly")
            .setContentText("Scheduled reminders")
            .setGroup(GROUP_REMINDERS)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .build()) }
    }

    fun cancel(id: Long) { runCatching { NotificationManagerCompat.from(context).cancel(id.toInt()) } }

    private fun actionIntent(id: Long, action: String) = PendingIntent.getBroadcast(
        context, (id.hashCode() * 31 + action.hashCode()),
        Intent(context, ReminderActionReceiver::class.java).setAction(action)
            .putExtra(ReminderScheduler.EXTRA_REMINDER_ID, id),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    companion object {
        const val CHANNEL_IMPORTANT = "important_reminders"
        const val CHANNEL_NORMAL = "normal_reminders"
        const val CHANNEL_SILENT = "silent_reminders"
        const val GROUP_REMINDERS = "remindly_reminders"
        const val SUMMARY_ID = 9_999
    }
}

package com.bhavesh.remindly.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.bhavesh.remindly.ReminderApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ReminderActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getLongExtra(ReminderScheduler.EXTRA_REMINDER_ID, -1L)
        if (id < 0) return
        val pendingResult = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val app = context.applicationContext as ReminderApp
                val reminder = app.repository.get(id) ?: return@launch
                when (intent.action) {
                    ACTION_DONE -> {
                        app.scheduler.cancel(id)
                        app.repository.update(reminder.copy(completed = true, enabled = false, nextTriggerAt = null, updatedAt = System.currentTimeMillis()))
                        app.notifications.cancel(id)
                    }
                    ACTION_SNOOZE -> {
                        val snoozeAt = System.currentTimeMillis() + reminder.snoozeDuration.coerceAtLeast(1) * 60_000L
                        app.scheduler.cancel(id)
                        app.repository.update(reminder.copy(enabled = true, nextTriggerAt = snoozeAt, updatedAt = System.currentTimeMillis()))
                        app.scheduler.scheduleAt(id, snoozeAt)
                        app.notifications.cancel(id)
                    }
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_DONE = "com.bhavesh.remindly.action.DONE"
        const val ACTION_SNOOZE = "com.bhavesh.remindly.action.SNOOZE"
    }
}

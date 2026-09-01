package com.bhavesh.remindly.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.bhavesh.remindly.ReminderApp
import com.bhavesh.remindly.data.RepeatType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getLongExtra(ReminderScheduler.EXTRA_REMINDER_ID, -1L)
        if (id < 0) return
        val pendingResult = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val app = context.applicationContext as ReminderApp
                val current = app.repository.get(id) ?: return@launch
                if (!current.enabled || current.completed) return@launch
                val leadMinutes = intent.getLongExtra(ReminderScheduler.EXTRA_LEAD_MINUTES, 0L)
                val repeat = RepeatType.from(current.repeatType)
                // A lead alert is an additional alert for the same event. It must
                // not consume the event or disable its exact-time alarm.
                if (leadMinutes > 0) {
                    app.notifications.show(current, leadMinutes)
                    return@launch
                }
                val updated = if (repeat == RepeatType.NEVER) {
                    current.copy(enabled = false, nextTriggerAt = null, lastTriggeredAt = System.currentTimeMillis(), updatedAt = System.currentTimeMillis())
                } else {
                    current.copy(lastTriggeredAt = System.currentTimeMillis(), nextTriggerAt = null, updatedAt = System.currentTimeMillis())
                }
                app.repository.update(updated)
                app.notifications.show(current)
                if (repeat != RepeatType.NEVER) app.scheduler.schedule(updated)
            } finally {
                pendingResult.finish()
            }
        }
    }
}

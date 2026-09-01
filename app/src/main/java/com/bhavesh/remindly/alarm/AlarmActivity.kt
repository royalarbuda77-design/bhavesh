package com.bhavesh.remindly.alarm

import android.app.KeyguardManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
import com.bhavesh.remindly.ReminderApp
import com.bhavesh.remindly.ui.AlarmExperience
import com.bhavesh.remindly.ui.RemindlyTheme
import kotlinx.coroutines.launch

class AlarmActivity : ComponentActivity() {
    private val reminderId get() = intent.getLongExtra(ReminderScheduler.EXTRA_REMINDER_ID, -1L)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        (getSystemService(KEYGUARD_SERVICE) as? KeyguardManager)?.requestDismissKeyguard(this, null)
        val app = application as ReminderApp
        lifecycleScope.launch {
            val reminder = app.repository.get(reminderId)
            if (reminder == null) finish()
            else setContent {
                RemindlyTheme(forceDark = true) {
                    AlarmExperience(
                        reminder = reminder,
                        onDone = {
                            lifecycleScope.launch {
                                app.scheduler.cancel(reminder.id)
                                app.repository.update(reminder.copy(completed = true, enabled = false, nextTriggerAt = null, updatedAt = System.currentTimeMillis()))
                                app.notifications.cancel(reminder.id)
                                finish()
                            }
                        },
                        onSnooze = {
                            lifecycleScope.launch {
                                val at = System.currentTimeMillis() + reminder.snoozeDuration.coerceAtLeast(1) * 60_000L
                                app.repository.update(reminder.copy(enabled = true, nextTriggerAt = at, updatedAt = System.currentTimeMillis()))
                                app.scheduler.scheduleAt(reminder.id, at)
                                app.notifications.cancel(reminder.id)
                                finish()
                            }
                        },
                        onDismiss = { app.notifications.cancel(reminder.id); finish() }
                    )
                }
            }
        }
    }
}

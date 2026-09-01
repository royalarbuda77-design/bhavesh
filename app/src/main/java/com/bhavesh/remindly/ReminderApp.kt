package com.bhavesh.remindly

import android.app.Application
import com.bhavesh.remindly.alarm.ReminderNotificationManager
import com.bhavesh.remindly.alarm.ReminderScheduler
import com.bhavesh.remindly.data.ReminderDatabase
import com.bhavesh.remindly.data.ReminderRepository

class ReminderApp : Application() {
    val database by lazy { ReminderDatabase.get(this) }
    val repository by lazy { ReminderRepository(database.reminderDao()) }
    val scheduler by lazy { ReminderScheduler(this, repository) }
    val notifications by lazy { ReminderNotificationManager(this) }

    override fun onCreate() {
        super.onCreate()
        notifications.createChannels()
    }
}

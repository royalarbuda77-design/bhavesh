package com.bhavesh.remindly.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.bhavesh.remindly.ReminderApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val result = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try { (context.applicationContext as ReminderApp).scheduler.rescheduleAll() }
            finally { result.finish() }
        }
    }
}

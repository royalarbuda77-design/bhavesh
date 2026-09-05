package com.jarvis.assistant.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object NotificationChannels {

    const val CHANNEL_SERVICE = "jarvis_service"
    const val CHANNEL_ALERTS = "jarvis_alerts"

    fun ensure(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL_SERVICE) == null) {
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_SERVICE, "Jarvis service",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Ongoing notification while Jarvis is on duty"
                    setShowBadge(false)
                }
            )
        }
        if (nm.getNotificationChannel(CHANNEL_ALERTS) == null) {
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ALERTS, "Jarvis alerts",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Reminders and important assistant alerts"
                    enableVibration(true)
                }
            )
        }
    }
}

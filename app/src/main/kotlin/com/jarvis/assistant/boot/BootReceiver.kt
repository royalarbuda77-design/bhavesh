package com.jarvis.assistant.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.jarvis.assistant.JarvisApp
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.service.JarvisService

/**
 * Re-arms Jarvis after reboot and reschedules pending reminders.
 * Android 14+ restricts microphone-foreground services started from the
 * background — we use the BOOT_COMPLETED grace window, and if the platform
 * refuses, we simply leave Jarvis dormant with a "tap to activate" state in
 * the app (never a crash).
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(
                Intent.ACTION_BOOT_COMPLETED,
                Intent.ACTION_LOCKED_BOOT_COMPLETED,
                Intent.ACTION_MY_PACKAGE_REPLACED
            )
        ) return

        runCatching {
            // Application.onCreate always precedes components → container exists
            val settings = com.jarvis.assistant.core.config.SettingsRepository.get()
            val cfg = settings.current()

            // 1) reminders first — they need no microphone privileges
            JarvisApp.container.reminders.rescheduleAll()

            // 2) assistant service, only when the user opted in & no crash-storm
            if (!cfg.autoStartOnBoot || SelfHealing.inSafeMode()) {
                JarvisLog.i("boot: auto-start skipped (opt-out or safe mode)")
                return
            }
            JarvisService.send(context, JarvisService.ACTION_START)
            JarvisLog.i("boot: Jarvis armed")
        }.onFailure { JarvisLog.w("boot receiver recovered", it) }
    }
}

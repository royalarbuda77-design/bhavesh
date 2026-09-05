package com.jarvis.assistant

import android.app.Application
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.di.AppContainer
import com.jarvis.assistant.util.NotificationChannels

class JarvisApp : Application() {

    override fun onCreate() {
        super.onCreate()
        // ── self-healing FIRST: everything after this line is protected ──
        SelfHealing.capturePlatformHandler()
        JarvisLog.attach(this)
        SelfHealing.init(this)
        SelfHealing.restartStrategy = {
            runCatching {
                val am = getSystemService(android.app.AlarmManager::class.java)
                val intent = android.content.Intent(this, com.jarvis.assistant.service.JarvisService::class.java)
                    .setAction(com.jarvis.assistant.service.JarvisService.ACTION_START)
                val pi = android.app.PendingIntent.getForegroundService(
                    this, 8001, intent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                )
                am?.set(
                    android.app.AlarmManager.RTC_WAKEUP,
                    System.currentTimeMillis() + 4_000, pi
                )
                JarvisLog.w("crash → scheduled service revival via AlarmManager")
            }
        }

        NotificationChannels.ensure(this)
        container = AppContainer(this, BuildConfig.BAKED_API_KEY)
        JarvisLog.i("JARVIS ${BuildConfig.VERSION_NAME} (${BuildConfig.BUILD_TYPE}) booted")
        if (SelfHealing.inSafeMode()) {
            JarvisLog.w("booting in SAFE MODE — auto-restart disabled until user repairs (Diagnostics)")
        }
    }

    companion object {
        /** Manual, framework-light DI graph (see :di). */
        lateinit var container: AppContainer
            private set
    }
}

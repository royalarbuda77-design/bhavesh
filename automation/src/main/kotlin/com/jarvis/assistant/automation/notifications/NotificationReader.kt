package com.jarvis.assistant.automation.notifications

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ActiveNotification(
    val key: String,
    val packageName: String,
    val title: String,
    val text: String,
    val postTime: Long
)

/**
 * Reads out & clears notifications — the user turns on "Notification access"
 * once in the wizard (system-policy: this can't be auto-granted).
 */
class JarvisNotificationListenerService : NotificationListenerService() {

    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = this
        NotificationReader.refreshFrom(this)
        JarvisLog.i("notification listener connected")
    }

    override fun onListenerDisconnected() {
        instance = null
        super.onListenerDisconnected()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        SelfHealing.guarded("notif-post", null) {
            if (sbn != null && !isIgnored(sbn.packageName)) NotificationReader.upsert(toActive(sbn))
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        SelfHealing.guarded("notif-removed", null) {
            sbn?.let { NotificationReader.remove(it.key) }
        }
    }

    private fun isIgnored(pkg: String): Boolean =
        pkg == "com.android.systemui" || pkg == packageName ||
            NOTIF_FILTER.any { pkg.contains(it, true) }

    private fun toActive(sbn: StatusBarNotification): ActiveNotification {
        val extras = sbn.notification?.extras
        val title = (extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()
            ?: extras?.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()
            ?: "")
        val text = (extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?: extras?.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            ?: extras?.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString()
            ?: "")
        val appName = runCatching {
            val pm = applicationContext.packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString()
        }.getOrDefault(sbn.packageName)
        return ActiveNotification(
            key = sbn.key,
            packageName = sbn.packageName,
            title = title.ifBlank { appName },
            text = text.take(300),
            postTime = sbn.postTime
        )
    }

    companion object {
        @Volatile var instance: JarvisNotificationListenerService? = null
            private set

        private val NOTIF_FILTER = listOf(
            "android", "com.android.phone", "com.android.incallui",
            "com.android.server.telecom", "com.android.bluetooth"
        )
    }
}

object NotificationReader {

    private val _notifications = MutableStateFlow<List<ActiveNotification>>(emptyList())
    val notifications: StateFlow<List<ActiveNotification>> = _notifications.asStateFlow()

    fun recent(max: Int = 5): List<ActiveNotification> =
        _notifications.value.sortedByDescending { it.postTime }.take(max)

    fun readAloud(context: Context, max: Int = 4): String {
        val list = recent(max)
        if (list.isEmpty()) return "You have no new notifications"
        val df = java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault())
        val body = list.joinToString(". ") {
            val app = shortApp(context, it.packageName)
            val t = listOf(it.title, it.text).filter { s -> s.isNotBlank() }.joinToString(": ")
            "$app says: $t at ${df.format(java.util.Date(it.postTime))}"
        }
        return "You have ${list.size} ${if (list.size == 1) "notification" else "notifications"}. $body"
    }

    fun dismissAll(): Boolean {
        val svc = JarvisNotificationListenerService.instance ?: return false
        runCatching { svc.cancelAllNotifications() }.onFailure { JarvisLog.w("dismissAll failed", it) }
        _notifications.value = emptyList()
        return true
    }

    fun dismissPackage(pkgNeedle: String): Boolean {
        val svc = JarvisNotificationListenerService.instance ?: return false
        val targets = _notifications.value.filter { it.packageName.contains(pkgNeedle, true) }
        if (targets.isEmpty()) return false
        targets.forEach { runCatching { svc.cancelNotification(it.key) } }
        _notifications.value = _notifications.value.filterNot { t -> targets.any { it.key == t.key } }
        return true
    }

    internal fun refreshFrom(svc: NotificationListenerService) {
        runCatching {
            val active = svc.activeNotifications.orEmpty()
                .filter { !it.isOngoing }
                .map { n ->
                    ActiveNotification(
                        key = n.key,
                        packageName = n.packageName,
                        title = n.notification?.extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty(),
                        text = n.notification?.extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty(),
                        postTime = n.postTime
                    )
                }
            _notifications.value = active
        }
    }

    internal fun upsert(n: ActiveNotification) {
        _notifications.value = (_notifications.value.filterNot { it.key == n.key } + n).takeLast(40)
    }

    internal fun remove(key: String) {
        _notifications.value = _notifications.value.filterNot { it.key == key }
    }

    private fun shortApp(context: Context, pkg: String): String = when {
        pkg.contains("whatsapp") -> "WhatsApp"
        pkg.contains("messenger") -> "Messenger"
        pkg.contains("instagram") -> "Instagram"
        pkg.contains("telegram") -> "Telegram"
        pkg.contains("gmail") || pkg.contains("gms") -> "Gmail"
        pkg.contains("android.dialer") || pkg.contains("dialer") -> "Phone"
        pkg.contains("sms") || pkg.contains("messaging") -> "Messages"
        pkg.contains("facebook") -> "Facebook"
        pkg.contains("spotify") -> "Spotify"
        pkg.contains("youtube") -> "YouTube"
        else -> runCatching {
            val pm = context.packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
        }.getOrDefault(pkg)
    }
}

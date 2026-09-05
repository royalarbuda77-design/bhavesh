package com.jarvis.assistant.automation.perms

import android.Manifest
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import android.provider.ContactsContract

/** Runtime-permission capabilities the assistant needs, with status + how to obtain. */
enum class Capability(val label: String, val whyShort: String) {
    MIC("Microphone (wake word + commands)", "Voice control of any kind"),
    NOTIFICATIONS("Post notifications", "Ongoing service & reminders must show a notification"),
    MODIFY_AUDIO("Modify audio settings", "Volume / mute / DND control"),
    CONTACTS("Contacts", "'Call mom' style name→number lookup"),
    CALL("Direct dial", "Start the call without a tap in the dialer"),
    SMS("Send SMS", "Voice-to-SMS delivery"),
    CALENDAR("Calendar", "Read your agenda"),
    OVERLAY("Display over other apps", "Floating HUD/Arc-Reactor widget"),
    WRITE_SETTINGS("Modify system settings", "Brightness / rotation / timeout control"),
    NOTIFICATION_ACCESS("Notification access", "Read & dismiss your notifications"),
    ACCESSIBILITY("Accessibility (Jarvis)", "Screen reading, gestures, screenshots"),
    BATTERY_IGNORE("Unrestricted battery", "Reliable always-listening on aggressive OEMs")
}

data class CapabilityStatus(
    val capability: Capability,
    val granted: Boolean,
    /** null → request via standard dialog; else opens this (special-access screens). */
    val manualIntent: Intent?
)

class PermissionFinder(private val context: Context) {

    private fun granted(p: String) =
        ContextCompat.checkSelfPermission(context, p) == android.content.pm.PackageManager.PERMISSION_GRANTED

    fun status(c: Capability): CapabilityStatus = when (c) {
        Capability.MIC -> CapabilityStatus(c, granted(Manifest.permission.RECORD_AUDIO), null)
        Capability.NOTIFICATIONS -> CapabilityStatus(
            c,
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || granted(Manifest.permission.POST_NOTIFICATIONS),
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) null else null
        )
        Capability.MODIFY_AUDIO -> CapabilityStatus(c, granted(Manifest.permission.MODIFY_AUDIO_SETTINGS), null)
        Capability.CONTACTS -> CapabilityStatus(c, granted(Manifest.permission.READ_CONTACTS), null)
        Capability.CALL -> CapabilityStatus(c, granted(Manifest.permission.CALL_PHONE), null)
        Capability.SMS -> CapabilityStatus(c, granted(Manifest.permission.SEND_SMS), null)
        Capability.CALENDAR -> CapabilityStatus(
            c,
            granted(Manifest.permission.READ_CALENDAR) && granted(Manifest.permission.WRITE_CALENDAR),
            null
        )
        Capability.OVERLAY -> CapabilityStatus(
            c, Settings.canDrawOverlays(context),
            Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        Capability.WRITE_SETTINGS -> CapabilityStatus(
            c, Settings.System.canWrite(context),
            Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        Capability.NOTIFICATION_ACCESS -> CapabilityStatus(c, isNotificationListenerEnabled(), notificationListenerIntent())
        Capability.ACCESSIBILITY -> CapabilityStatus(c, isAccessibilityEnabled(), Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        Capability.BATTERY_IGNORE -> CapabilityStatus(c, isIgnoringBattery(), batteryIntent())
    }

    fun needsAny(vararg caps: Capability): List<Capability> =
        caps.filter { !status(it).granted }

    // ── special access probes ────────────────────────────────────────────────
    fun isNotificationListenerEnabled(): Boolean {
        val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
        return flat.contains(context.packageName)
    }

    fun isAccessibilityEnabled(): Boolean {
        val flat = Settings.Secure.getString(context.contentResolver, "enabled_accessibility_services") ?: ""
        return flat.contains("${context.packageName}/com.jarvis.assistant.automation.screen.JarvisAccessibilityService") ||
            flat.contains("${context.packageName}/.automation.screen.JarvisAccessibilityService")
    }

    fun isIgnoringBattery(): Boolean = runCatching {
        val pm = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        pm.isIgnoringBatteryOptimizations(context.packageName)
    }.getOrDefault(true)

    fun notificationListenerIntent(): Intent =
        Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    fun batteryIntent(): Intent? = runCatching {
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }.getOrNull()

    companion object {
        /** DND policy access (setInterruptionFilter) — separate special permission. */
        fun hasDndAccess(context: Context): Boolean = runCatching {
            val am = context.getSystemService(AudioManager::class.java)
            val nm = context.getSystemService(android.app.NotificationManager::class.java)
            nm != null && nm.isNotificationPolicyAccessGranted && am != null
        }.getOrDefault(false)

        fun dndPanelIntent(): Intent =
            Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        fun appSettingsIntent(packageName: String): Intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:$packageName")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
}

/** The runtime permissions a capability needs (empty → install-time or special access). */
fun PermissionFinder.runtimePermissionsFor(c: Capability): Array<String> = when (c) {
    Capability.MIC -> arrayOf(Manifest.permission.RECORD_AUDIO)
    Capability.NOTIFICATIONS ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) arrayOf(Manifest.permission.POST_NOTIFICATIONS)
        else emptyArray()
    Capability.CONTACTS -> arrayOf(Manifest.permission.READ_CONTACTS)
    Capability.CALL -> arrayOf(Manifest.permission.CALL_PHONE)
    Capability.SMS -> arrayOf(Manifest.permission.SEND_SMS)
    Capability.CALENDAR ->
        arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
    else -> emptyArray()
}

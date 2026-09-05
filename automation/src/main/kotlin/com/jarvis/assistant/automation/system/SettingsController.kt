package com.jarvis.assistant.automation.system

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import androidx.annotation.RequiresPermission
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.automation.I18n
import com.jarvis.assistant.automation.perms.PermissionFinder

/**
 * Result of one device-control attempt.
 * @param ok  did the requested change (definitely/very-likely) happen
 * @param speech  a short sentence to speak to the user
 * @param openedPanel  true when Android forced us into a system panel (Q+ rules)
 */
data class ExecOutcome(
    val ok: Boolean,
    val speech: String,
    val openedPanel: Boolean = false,
    val showText: String? = null
)

/**
 * Every system-settings capability, with honest Android-compliant behaviour:
 *
 *  • Android 10+ forbids third-party apps from silently flipping Wi-Fi,
 *    Bluetooth, mobile data, hotspot, location, air-mode, NFC… The
 *    COMPLIANT way is the Quick-Settings panel (ACTION_PANEL_*) / system
 *    screen, exactly one tap away — implemented here with graceful
 *    fallbacks per API level. Anything the OS permits silently (torch,
 *    brightness*, volume, DND, rotation-lock*, timeout*) is done silently.
 *    (* = needs the matching special-access grant, requested in the wizard)
 */
@Suppress("DEPRECATION")
class SettingsController(private val context: Context) {

    private val lang: String = "en"

    private val wifiManager: WifiManager?
        get() = runCatching { context.getSystemService(WifiManager::class.java) }.getOrNull()

    private val bluetoothAdapter: BluetoothAdapter?
        get() = runCatching {
            context.getSystemService(BluetoothManager::class.java)?.adapter
        }.getOrNull()

    private val audioManager: AudioManager?
        get() = runCatching { context.getSystemService(AudioManager::class.java) }.getOrNull()

    private val notifManager: android.app.NotificationManager?
        get() = runCatching { context.getSystemService(android.app.NotificationManager::class.java) }.getOrNull()

    // ── Wi-Fi ────────────────────────────────────────────────────────────────
    fun setWifi(enable: Boolean?): ExecOutcome {
        val wm = wifiManager ?: return ExecOutcome(false, "Wi-Fi manager unavailable")
        val current = runCatching { wm.isWifiEnabled }.getOrDefault(false)
        val want = enable ?: !current
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // silent toggles are blocked for non-system apps since Android 10
            openPanel(Settings.ACTION_WIFI_SETTINGS, "android.settings.PANEL_WIFI")
            return ExecOutcome(
                true,
                I18n.panelOpened(lang, if (want) "Wi-Fi ON" else "Wi-Fi OFF"),
                openedPanel = true
            )
        }
        val ok = runCatching { wm.setWifiEnabled(want) }.getOrDefault(false)
        return ExecOutcome(ok, if (ok) "Wi-Fi ${if (want) "on" else "off"}" else "Panel opened — tap to confirm")
    }

    fun wifiStatus(): ExecOutcome {
        val on = runCatching { wifiManager?.isWifiEnabled == true }.getOrDefault(false)
        val ssid = runCatching {
            @Suppress("MissingPermission")
            wifiManager?.connectionInfo?.ssid?.trim('"')
        }.getOrNull()
        val detail = if (on) "Wi-Fi is on${if (!ssid.isNullOrBlank() && ssid != "<unknown ssid>") ", connected to $ssid" else ""}"
        else "Wi-Fi is off"
        return ExecOutcome(true, detail)
    }

    // ── Bluetooth ────────────────────────────────────────────────────────────
    fun setBluetooth(enable: Boolean?): ExecOutcome {
        val ad = bluetoothAdapter ?: return ExecOutcome(false, "This device has no Bluetooth")
        val want = enable ?: !ad.isEnabled
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            openPanel(Settings.ACTION_BLUETOOTH_SETTINGS, null)
            return ExecOutcome(true, I18n.panelOpened(lang, if (want) "Bluetooth ON" else "Bluetooth OFF"), openedPanel = true)
        }
        val ok = runCatching { if (want) ad.enable() else ad.disable() }.getOrDefault(false)
        return ExecOutcome(ok, if (ok) "Bluetooth ${if (want) "on" else "off"}" else "Bluetooth panel opened — tap to confirm", openedPanel = !ok)
    }

    fun bluetoothStatus(): ExecOutcome {
        val on = runCatching { bluetoothAdapter?.isEnabled == true }.getOrDefault(false)
        return ExecOutcome(true, "Bluetooth is ${if (on) "on" else "off"}")
    }

    // ── Torch (works silently on every version) ─────────────────────────────
    @RequiresPermission(Manifest.permission.CAMERA)
    fun setTorch(enable: Boolean?): ExecOutcome {
        val cm = runCatching { context.getSystemService(CameraManager::class.java) }
            .getOrNull() ?: return ExecOutcome(false, "Camera manager unavailable")
        val want = enable ?: true
        return try {
            val ids = cm.cameraIdList
            var done = false
            for (id in ids) {
                val hasFlash = runCatching {
                    cm.getCameraCharacteristics(id)
                        .get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                }.getOrDefault(false)
                if (hasFlash) {
                    cm.setTorchMode(id, want)
                    done = true
                    break
                }
            }
            if (done) ExecOutcome(true, I18n.done(lang, if (want) "Torch" else "Torch", if (want) "on" else "off"))
            else ExecOutcome(false, "This phone has no flash light")
        } catch (t: Throwable) {
            JarvisLog.w("torch failed", t)
            ExecOutcome(false, "Could not switch the torch right now")
        }
    }

    // ── Hotspot ──────────────────────────────────────────────────────────────
    fun setHotspot(enable: Boolean?): ExecOutcome {
        openPanel(Settings.ACTION_SETTINGS, "android.settings.TETHER_SETTINGS")
        return ExecOutcome(true, I18n.panelOpened(lang, "Hotspot / Tethering"), openedPanel = true)
    }

    // ── Mobile data ──────────────────────────────────────────────────────────
    @RequiresPermission(Manifest.permission.MODIFY_PHONE_STATE)
    fun setMobileData(enable: Boolean?): ExecOutcome {
        val tm = runCatching { context.getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager }.getOrNull()
        val want = enable ?: true
        // setMobileDataEnabled reflection only worked pre-10; modern path = settings panel.
        val ok = tm != null && runCatching {
            val m = tm.javaClass.getMethod("setDataEnabled", Boolean::class.javaPrimitiveType)
            m.invoke(tm, want)
            true
        }.getOrDefault(false)
        return if (ok) ExecOutcome(true, "Mobile data ${if (want) "on" else "off"}")
        else {
            openPanel(Settings.ACTION_SETTINGS, "android.settings.DATA_ROAMING_SETTINGS")
            ExecOutcome(true, I18n.panelOpened(lang, "Mobile data"), openedPanel = true)
        }
    }

    // ── Location / GPS ───────────────────────────────────────────────────────
    fun setLocation(enable: Boolean?): ExecOutcome {
        val on = isLocationOn()
        val want = enable ?: !on
        if (want == on) return ExecOutcome(true, "Location is already ${if (on) "on" else "off"}")
        openPanel(Settings.ACTION_LOCATION_SOURCE_SETTINGS, null)
        return ExecOutcome(
            true,
            I18n.panelOpened(lang, if (want) "Location ON" else "Location OFF"),
            openedPanel = true
        )
    }

    fun locationStatus(): ExecOutcome =
        ExecOutcome(true, "Location is ${if (isLocationOn()) "on" else "off"}")

    fun isLocationOn(): Boolean = runCatching {
        val pm = context.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
        pm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ||
            pm.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)
    }.getOrDefault(false)

    // ── Brightness ───────────────────────────────────────────────────────────
    fun brightnessOp(valuePercent: Int?, deltaPercent: Int?, autoToggle: Boolean): ExecOutcome {
        if (!Settings.System.canWrite(context)) {
            openPanel(Settings.ACTION_MANAGE_WRITE_SETTINGS, null)
            return ExecOutcome(
                false,
                I18n.noPermission(lang, "Modify system settings"),
                openedPanel = true
            )
        }
        return try {
            val cr = context.contentResolver
            val cur = runCatching {
                Settings.System.getInt(cr, Settings.System.SCREEN_BRIGHTNESS)
            }.getOrDefault(128)
            val curPct = (cur * 100) / 255
            when {
                autoToggle -> {
                    val mode = Settings.System.getInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE)
                    val auto = mode == Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC
                    Settings.System.putInt(
                        cr, Settings.System.SCREEN_BRIGHTNESS_MODE,
                        if (auto) Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
                        else Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC
                    )
                    ExecOutcome(true, "Auto-brightness ${if (auto) "off" else "on"}")
                }
                deltaPercent != null -> {
                    val next = (curPct + deltaPercent).coerceIn(2, 100)
                    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS, next * 255 / 100)
                    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
                    ExecOutcome(true, "Brightness set to $next percent")
                }
                else -> {
                    val v = (valuePercent ?: 80).coerceIn(2, 100)
                    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS, v * 255 / 100)
                    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
                    ExecOutcome(true, "Brightness set to $v percent")
                }
            }
        } catch (t: Throwable) {
            JarvisLog.w("brightness failed", t)
            ExecOutcome(false, "Could not change brightness")
        }
    }

    // ── Volume & ringer ──────────────────────────────────────────────────────
    fun volumeOp(setTo: Int?, deltaSteps: Int?, stream: Int = AudioManager.STREAM_MUSIC): ExecOutcome {
        val am = audioManager ?: return ExecOutcome(false, "Audio manager unavailable")
        return try {
            val max = am.getStreamMaxVolume(stream)
            val cur = am.getStreamVolume(stream)
            val next = when {
                setTo != null -> (setTo * max / 100)
                deltaSteps != null -> cur + deltaSteps
                else -> max / 2
            }.coerceIn(0, max)
            am.setStreamVolume(stream, next, 0)
            val name = when (stream) {
                AudioManager.STREAM_MUSIC -> "Media volume"
                AudioManager.STREAM_RING -> "Ring volume"
                AudioManager.STREAM_ALARM -> "Alarm volume"
                else -> "Volume"
            }
            ExecOutcome(true, "$name at ${(next * 100 / max.coerceAtLeast(1))} percent")
        } catch (t: Throwable) {
            JarvisLog.w("volume failed", t)
            ExecOutcome(false, "Could not change volume (check Do-Not-Disturb policy)")
        }
    }

    fun mute(enable: Boolean): ExecOutcome = setDnd(enable)

    // ── Do-Not-Disturb / silent ──────────────────────────────────────────────
    fun setDnd(enable: Boolean?): ExecOutcome {
        val nm = notifManager ?: return ExecOutcome(false, "Notification manager unavailable")
        if (!nm.isNotificationPolicyAccessGranted) {
            context.startActivity(PermissionFinder.dndPanelIntent())
            return ExecOutcome(
                false,
                I18n.noPermission(lang, "Do-Not-Disturb access"),
                openedPanel = true
            )
        }
        val want = enable ?: true
        return runCatching {
            nm.setInterruptionFilter(
                if (want) android.app.NotificationManager.INTERRUPTION_FILTER_NONE
                else android.app.NotificationManager.INTERRUPTION_FILTER_ALL
            )
            ExecOutcome(true, if (want) "Do Not Disturb on — only alarms will ring" else "Do Not Disturb off")
        }.getOrElse {
            JarvisLog.w("dnd failed", it)
            ExecOutcome(false, "Could not change DND state")
        }
    }

    // ── Rotation lock ────────────────────────────────────────────────────────
    fun setRotationAuto(enable: Boolean?): ExecOutcome {
        if (!Settings.System.canWrite(context)) {
            openPanel(Settings.ACTION_MANAGE_WRITE_SETTINGS, null)
            return ExecOutcome(false, I18n.noPermission(lang, "Modify system settings"), openedPanel = true)
        }
        return runCatching {
            val cr = context.contentResolver
            val cur = runCatching { Settings.System.getInt(cr, Settings.System.ACCELEROMETER_ROTATION) }.getOrDefault(1)
            val want = if (enable == null) if (cur == 1) 0 else 1 else if (enable) 1 else 0
            Settings.System.putInt(cr, Settings.System.ACCELEROMETER_ROTATION, want)
            ExecOutcome(true, if (want == 1) "Auto-rotate enabled" else "Rotation locked")
        }.getOrElse {
            JarvisLog.w("rotation failed", it)
            ExecOutcome(false, "Could not change rotation")
        }
    }

    /** Lock to a fixed orientation via user_rotation (API 23+, WRITE_SETTINGS). */
    fun lockRotation(kind: String): ExecOutcome {
        if (!Settings.System.canWrite(context)) {
            return ExecOutcome(false, I18n.noPermission(lang, "Modify system settings"), openedPanel = true)
        }
        val rotation = when (kind.lowercase()) {
            "portrait", "p" -> 0
            "landscape", "l", "horizontal" -> 1
            else -> 0
        }
        return runCatching {
            Settings.System.putInt(context.contentResolver, Settings.System.USER_ROTATION, rotation)
            Settings.System.putInt(context.contentResolver, Settings.System.ACCELEROMETER_ROTATION, 0)
            ExecOutcome(true, "Locked to $kind")
        }.getOrElse {
            JarvisLog.w("lock rotation failed", it)
            ExecOutcome(false, "This device restricts rotation locking")
        }
    }

    // ── Screen timeout ───────────────────────────────────────────────────────
    fun setScreenTimeout(ms: Long): ExecOutcome {
        if (!Settings.System.canWrite(context)) {
            openPanel(Settings.ACTION_MANAGE_WRITE_SETTINGS, null)
            return ExecOutcome(false, I18n.noPermission(lang, "Modify system settings"), openedPanel = true)
        }
        return runCatching {
            Settings.System.putLong(context.contentResolver, Settings.System.SCREEN_OFF_TIMEOUT, ms)
            ExecOutcome(true, "Screen timeout set")
        }.getOrElse { ExecOutcome(false, "Could not change timeout") }
    }

    // ── Airplane mode (panel path) ───────────────────────────────────────────
    fun setAirplane(enable: Boolean?): ExecOutcome {
        openPanel(Settings.ACTION_AIRPLANE_MODE_SETTINGS, null)
        val on = runCatching {
            Settings.Global.getInt(context.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) == 1
        }.getOrDefault(false)
        return ExecOutcome(
            true,
            "Airplane mode is currently ${if (on) "ON" else "OFF"}. " + I18n.panelOpened(lang, "Airplane"),
            openedPanel = true
        )
    }

    // ── Night light (best-effort secure setting, else panel) ─────────────────
    fun setNightLight(enable: Boolean?): ExecOutcome {
        val want = if (enable == true) 1 else 0
        val ok = runCatching {
            Settings.Secure.putInt(context.contentResolver, "night_display_activated", want)
            true
        }.getOrDefault(false)
        return if (ok) ExecOutcome(true, "Night light ${if (want == 1) "on" else "off"}")
        else {
            openPanel("android.settings.DISPLAY_SETTINGS", null)
            ExecOutcome(true, I18n.panelOpened(lang, "Night light"), openedPanel = true)
        }
    }

    /** Dispatch any settings panel string or action, trying new task flags. */
    private fun openPanel(action: String, altAction: String? = null) {
        val attempt = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val viaAlt = altAction?.let { Intent(it).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        val tried = listOfNotNull(attempt, viaAlt)
        for (i in tried) {
            val done = runCatching { context.startActivity(i); true }.getOrDefault(false)
            if (done) return
        }
        JarvisLog.w("no settings panel could be opened: $action / $altAction")
    }
}

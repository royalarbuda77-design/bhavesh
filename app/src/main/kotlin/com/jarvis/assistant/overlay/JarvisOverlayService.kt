package com.jarvis.assistant.overlay

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.setViewTreeLifecycleOwner
import androidx.compose.ui.platform.setViewTreeSavedStateRegistryOwner
import androidx.compose.ui.platform.setViewTreeViewModelStoreOwner
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import com.jarvis.assistant.JarvisApp
import com.jarvis.assistant.service.JarvisService
import com.jarvis.assistant.ui.JarvisTheme
import com.jarvis.assistant.ui.hud.HudBubble
import com.jarvis.assistant.ui.hud.HudControls
import com.jarvis.assistant.util.NotificationChannels
import kotlin.math.abs

/**
 * The floating Arc-Reactor HUD — a system-overlay bubble that lives above
 * every screen (Iron-Man style), reacts to the mic in real time and lets the
 * user:
 *   tap        → push-to-talk
 *   drag       → reposition (snaps to the nearest screen edge on release)
 *   long-press → open the JARVIS app
 *   double-tap → hide & turn the overlay off in Settings
 *
 * Compose inside a ComposeView on a WindowManager layer; the service is the
 * lifecycle / saved-state / viewmodel owner, so composition is 100 % standard
 * (no leaked local-recomposition owners).
 */
class JarvisOverlayService : LifecycleService(), SavedStateRegistryOwner, ViewModelStoreOwner {

    companion object {
        const val BUBBLE_WIDTH_DP = 132f

        fun isPermissionGranted(context: Context): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

        fun start(context: Context) {
            if (!isPermissionGranted(context)) return
            runCatching {
                val i = Intent(context, JarvisOverlayService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(i)
                else context.startService(i)
            }
        }

        fun stop(context: Context) {
            runCatching { context.stopService(Intent(context, JarvisOverlayService::class.java)) }
        }
    }

    private val registryController = SavedStateRegistryController.create(this)
    private val store = ViewModelStore()
    override val savedStateRegistry: SavedStateRegistry get() = registryController.savedStateRegistry
    override val viewModelStore: ViewModelStore get() = store

    private var windowManager: WindowManager? = null
    private var composeView: ComposeView? = null
    private var params: WindowManager.LayoutParams? = null
    private var lastSnapAt = 0L

    override fun onCreate() {
        super.onCreate()
        registryController.performRestore(null)
        val notif = androidx.core.app.NotificationCompat.Builder(this, NotificationChannels.CHANNEL_SERVICE)
            .setSmallIcon(com.jarvis.assistant.R.drawable.ic_stat_jarvis)
            .setContentTitle("JARVIS HUD")
            .setContentText("Floating reactor on screen")
            .setOngoing(true)
            .build()
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    4243, notif,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } else startForeground(4243, notif)
        }.onFailure { stopSelf(); return }
        attachHud()
    }

    private fun attachHud() {
        if (!isPermissionGranted(this)) { stopSelf(); return }
        val wm = getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: run { stopSelf(); return }
        windowManager = wm

        val view = ComposeView(this).apply {
            setViewTreeLifecycleOwner(this@JarvisOverlayService)
            setViewTreeSavedStateRegistryOwner(this@JarvisOverlayService)
            setViewTreeViewModelStoreOwner(this@JarvisOverlayService)
            setContent {
                JarvisTheme(dark = true) {
                    HudBubble(controls = controls)
                }
            }
        }

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE

        val p = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            val dm = resources.displayMetrics
            x = (dm.widthPixels - dp(BUBBLE_WIDTH_DP) - dp(8)).coerceAtLeast(0)
            y = dp(120)
        }
        params = p
        composeView = view
        runCatching { wm.addView(view, p) }.onFailure { stopSelf() }
    }

    private fun dp(v: Float): Int = (v * resources.displayMetrics.density).toInt()

    private val controls = object : HudControls {
        override fun onTapTalk() {
            JarvisService.send(this@JarvisOverlayService, JarvisService.ACTION_TALK)
        }

        override fun onLongPressOpen() {
            runCatching {
                startActivity(
                    packageManager.getLaunchIntentForPackage(packageName)
                        ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }
        }

        override fun onDoubleTapClose() {
            JarvisApp.container.settings.edit { it.copy(overlayEnabled = false) }
            stopSelf()
        }

        override fun onDragBy(dx: Float, dy: Float) {
            val p = params ?: return
            val dm = resources.displayMetrics
            val bubbleW = dp(BUBBLE_WIDTH_DP)
            val statusPad = dp(24f)
            p.x = (p.x + dx).toInt().coerceIn(0, dm.widthPixels - bubbleW)
            p.y = (p.y + dy).toInt().coerceIn(statusPad, (dm.heightPixels - bubbleW - statusPad).coerceAtLeast(statusPad))
            runCatching { windowManager?.updateViewLayout(composeView, p) }
        }

        override fun onDragEnd() {
            val p = params ?: return
            val now = System.currentTimeMillis()
            if (now - lastSnapAt < 350) return
            lastSnapAt = now
            val dm = resources.displayMetrics
            val bubbleW = dp(BUBBLE_WIDTH_DP)
            val center = p.x + bubbleW / 2
            val right = dm.widthPixels - bubbleW
            p.x = if (abs(center - 0) < abs(center - dm.widthPixels)) 0 else right
            runCatching { windowManager?.updateViewLayout(composeView, p) }
        }
    }

    override fun onDestroy() {
        composeView?.let { v -> runCatching { windowManager?.removeView(v) } }
        composeView = null
        store.clear()
        super.onDestroy()
    }
}

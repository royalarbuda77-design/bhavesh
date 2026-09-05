package com.jarvis.assistant.automation.screen

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Matrix
import android.hardware.display.DisplayManager
import android.os.Build
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Jarvis's hands and eyes.
 *
 *  • hands   — global actions (back/home) and scroll gestures anywhere.
 *  • eyes    — visible-screen text extraction (fast, offline, private) and
 *              screenshot capture for Gemini vision (Android 11+ system API —
 *              no MediaProjection consent dialog mid-conversation).
 *
 * The user enables it once via the wizard (system policy). Config lives in
 * res/xml/accessibility_service_config.xml (canTakeScreenshot / canPerformGestures).
 */
class JarvisAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        connected.value = true
        JarvisLog.i("Jarvis accessibility connected")
    }

    override fun onUnbind(intent: Intent?): Boolean {
        instance = null
        connected.value = false
        return super.onUnbind(intent)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        SelfHealing.guarded("a11y-event", null) {
            val pkg = event.packageName?.toString().orEmpty()
            if (pkg.isNotBlank() && pkg != packageName) {
                focusedApp.value = pkg
                focusedClass.value = event.className?.toString().orEmpty()
            }
        }
    }

    override fun onInterrupt() = Unit

    // ── actions ──────────────────────────────────────────────────────────────
    fun pressBack(): Boolean = runCatching { performGlobalAction(GLOBAL_ACTION_BACK) }.getOrDefault(false)
    fun pressHome(): Boolean = runCatching { performGlobalAction(GLOBAL_ACTION_HOME) }.getOrDefault(false)
    fun pressRecents(): Boolean = runCatching { performGlobalAction(GLOBAL_ACTION_RECENTS) }.getOrDefault(false)
    fun openNotifications(): Boolean =
        runCatching { performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS) }.getOrDefault(false)

    /**
     * One-finger swipe in the middle of the screen. [down] = scroll content
     * downward (finger up? no: down means finger travels down).
     */
    fun scroll(down: Boolean): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        return runCatching {
            val metrics = resources.displayMetrics
            val cx = metrics.widthPixels / 2f
            val upY = metrics.heightPixels * 0.30f
            val downY = metrics.heightPixels * 0.70f
            val path = android.graphics.Path()
            if (down) {
                path.moveTo(cx, upY)
                path.lineTo(cx, downY)
            } else {
                path.moveTo(cx, downY)
                path.lineTo(cx, upY)
            }
            val stroke = android.accessibilityservice.GestureDescription.StrokeDescription(path, 0, 220)
            val gesture = android.accessibilityservice.GestureDescription.Builder().addStroke(stroke).build()
            dispatchGesture(gesture, null, null)
        }.getOrDefault(false)
    }

    companion object {
        @Volatile
        var instance: JarvisAccessibilityService? = null
            private set

        val connected = MutableStateFlow(false)

        /** e.g. "com.whatsapp" — feeds screen-context to Gemini prompts. */
        val focusedApp = MutableStateFlow("")
        val focusedClass = MutableStateFlow("")

        fun with(block: (JarvisAccessibilityService) -> Unit): Boolean =
            runCatching { instance?.let { block(it); true } ?: false }.getOrDefault(false)
    }
}

/**
 * Screen intelligence façade used by the router & orchestrator.
 * All methods degrade gracefully (null/false) when the service isn't enabled
 * so nothing crashes when the user hasn't granted Accessibility yet.
 */
object ScreenContext {

    val isReady: Boolean get() = JarvisAccessibilityService.instance != null

    /** ~6 000 chars of the visible window's text, offline. */
    fun visibleText(limit: Int = 6000): String? {
        val svc = JarvisAccessibilityService.instance ?: return null
        return try {
            val root = svc.rootInActiveWindow ?: return null
            val sb = StringBuilder()
            collectText(root, sb, limit)
            sb.toString().trim().takeIf { it.isNotBlank() }
        } catch (t: Throwable) {
            SelfHealing.reportError("screen-text", t)
            null
        }
    }

    private fun collectText(node: AccessibilityNodeInfo?, sb: StringBuilder, limit: Int) {
        node ?: return
        if (sb.length >= limit) return
        runCatching {
            node.text?.let { if (it.isNotBlank()) sb.append(it).append('\n') }
            node.contentDescription?.let {
                if (it.isNotBlank() && sb.indexOf(it.toString()) < 0) sb.append(it).append('\n')
            }
        }
        val childCount = runCatching { node.childCount }.getOrDefault(0)
        if (childCount in 1..80) {
            for (i in 0 until childCount) {
                val child = runCatching { node.getChild(i) }.getOrNull()
                if (child != null) collectText(child, sb, limit)
            }
        }
    }

    /**
     * Screenshot → JPEG for Gemini vision (downscaled to longest edge [maxDim]).
     * Uses the accessibility screenshot API (Android 11+) — no sharing dialog
     * mid-conversation, unlike MediaProjection.
     */
    suspend fun captureJpeg(maxDim: Int = 1280, quality: Int = 72): ByteArray? {
        val svc = JarvisAccessibilityService.instance ?: return null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            JarvisLog.d("screenshot needs Android 11+; device is API ${Build.VERSION.SDK_INT}")
            return null
        }
        val bitmap = try {
            suspendCancellableCoroutine<Bitmap?> { cont ->
                val settled = java.util.concurrent.atomic.AtomicBoolean(false)
                try {
                    svc.takeScreenshot(
                        Display.DEFAULT_DISPLAY,
                        svc.mainExecutor,
                        java.util.function.Consumer { result: AccessibilityService.ScreenshotResult ->
                            val bmp = runCatching {
                                val buffer = result.hardwareBuffer
                                val wrapped = Bitmap.wrapHardwareBuffer(buffer, result.colorSpace)
                                runCatching { buffer.close() }
                                wrapped?.copy(Bitmap.Config.ARGB_8888, false)
                            }.getOrNull()
                            if (settled.compareAndSet(false, true) && cont.isActive) cont.resume(bmp) {}
                        }
                    )
                } catch (t: Throwable) {
                    if (settled.compareAndSet(false, true) && cont.isActive) cont.resume(null) {}
                }
                cont.invokeOnCancellation { settled.set(true) }
            }
        } catch (t: Throwable) {
            SelfHealing.reportError("screenshot", t)
            null
        } ?: return null

        return try {
            val longest = maxOf(bitmap.width, bitmap.height).coerceAtLeast(1)
            val scale = minOf(1f, maxDim.toFloat() / longest)
            val out = if (scale < 1f) {
                val m = Matrix().apply { postScale(scale, scale) }
                Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
            } else bitmap
            val bos = ByteArrayOutputStream()
            out.compress(Bitmap.CompressFormat.JPEG, quality, bos)
            bos.toByteArray()
        } catch (t: Throwable) {
            SelfHealing.reportError("screen-jpeg", t)
            null
        } finally {
            runCatching { bitmap.recycle() }
        }
    }

    fun currentAppLabel(): String {
        val pkg = JarvisAccessibilityService.focusedApp.value
        if (pkg.isBlank()) return ""
        return when {
            pkg.contains("whatsapp") -> "WhatsApp"
            pkg.contains("instagram") -> "Instagram"
            pkg.contains("youtube") -> "YouTube"
            pkg.contains("chrome") -> "Chrome"
            else -> pkg.substringAfterLast('.')
        }
    }
}

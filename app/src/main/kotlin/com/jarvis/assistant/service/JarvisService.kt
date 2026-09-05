package com.jarvis.assistant.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.jarvis.assistant.JarvisApp
import com.jarvis.assistant.R
import com.jarvis.assistant.core.config.PowerProfile
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.state.AssistantState
import com.jarvis.assistant.core.state.JarvisBus
import com.jarvis.assistant.core.state.JarvisEvent
import com.jarvis.assistant.util.NotificationChannels
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * The always-on heart of Jarvis.
 *
 *  • foreground service (type=microphone on Q+) — "Wake up Jarvis" 24/7
 *  • START_STICKY + AlarmManager revival (SelfHealing) — survives kills
 *  • power policy: screen/charging-aware duty cycle; auto-degrades to SAVER
 *    below 15 % battery while uncharged
 *  • watchdog: any engine that wedges silently is restarted without user pain
 *  • "Shutdown Jarvis" → [sleepMode]: mic, gate and ASR engines fully released
 */
class JarvisService : Service() {

    companion object {
        const val ACTION_START = "com.jarvis.assistant.action.START"
        const val ACTION_STOP = "com.jarvis.assistant.action.STOP"
        const val ACTION_SLEEP = "com.jarvis.assistant.action.SLEEP"
        const val ACTION_WAKE = "com.jarvis.assistant.action.WAKE"
        const val ACTION_TALK = "com.jarvis.assistant.action.TALK"
        const val ACTION_SPEAK = "com.jarvis.assistant.action.SPEAK"

        const val NOTIF_ID = 4242

        @Volatile
        var instance: JarvisService? = null
            private set

        val isRunning: Boolean get() = instance != null

        fun send(context: Context, action: String, extras: Bundle? = null) {
            val intent = Intent(action).setClassName(context.packageName, JarvisService::class.java.name)
            extras?.let { intent.putExtras(it) }
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    context.startForegroundService(intent)
                else context.startService(intent)
            }.recoverCatching {
                // aggressive OEMs sometimes block FGS-start-from-background;
                // plain startService still delivers onStartCommand when idle
                runCatching { context.startService(intent) }
            }
        }
    }

    private val c get() = JarvisApp.container
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate + SelfHealing.handler)

    private var watchdogJob: Job? = null
    private var settingsJob: Job? = null
    private var eventsJob: Job? = null

    @Volatile private var sleeping = false
    @Volatile private var lastActivity = System.currentTimeMillis()

    // ── lifecycle ────────────────────────────────────────────────────────────
    override fun onCreate() {
        super.onCreate()
        instance = this
        NotificationChannels.ensure(this)
        startForegroundCompat(buildNotification(AssistantState.SLEEPING))

        registerReceiver(
            powerReceiver,
            IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_SCREEN_OFF)
                addAction(Intent.ACTION_POWER_CONNECTED)
                addAction(Intent.ACTION_POWER_DISCONNECTED)
            }
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                teardownEngines()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SLEEP -> sleepMode()
            ACTION_WAKE -> wakeMode()
            ACTION_TALK -> {
                if (sleeping) wakeMode(notifyUi = false)
                c.orchestrator.beginListening(manual = true)
            }
            ACTION_SPEAK -> intent.getStringExtra("text")?.let { c.orchestrator.speakOnly(it) }
            else -> ensureEngines()
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        instance = null
        runCatching { unregisterReceiver(powerReceiver) }
        teardownEngines()
        scope.coroutineContext[Job]?.cancel()
        JarvisLog.i("Jarvis service destroyed")
        super.onDestroy()
    }

    // ── engines ──────────────────────────────────────────────────────────────
    private fun ensureEngines() {
        startForegroundCompat(buildNotification(if (sleeping) AssistantState.SLEEPING else AssistantState.IDLE))

        val cfg = c.settings.current()
        c.wake.profile = cfg.powerProfile
        c.wake.sensitivity = cfg.wakeSensitivity

        c.wake.onWake = {
            if (sleeping) {
                wakeMode()
            }
            c.orchestrator.beginListening(manual = false)
        }
        c.wake.onSleepRequested = { sleepMode() }
        c.wake.onStopSpeaking = {
            c.tts.stop()
            c.stt.cancel()
        }

        sleeping = false
        if (cfg.wakeEnabled) {
            c.wake.reacquireMic()
            c.wake.start()
        }
        setUi(AssistantState.IDLE, "on duty")

        if (watchdogJob == null) startWatchdog()
        if (settingsJob == null) collectSettings()
        if (eventsJob == null) collectEvents()

        // Overlay follows the toggle
        runCatching {
            if (c.settings.current().overlayEnabled) {
                com.jarvis.assistant.overlay.JarvisOverlayService.start(this)
            } else com.jarvis.assistant.overlay.JarvisOverlayService.stop(this)
        }
    }

    fun sleepMode(speakFirst: Boolean = true) {
        if (sleeping) return
        sleeping = true
        if (speakFirst) {
            c.tts.speak("Sleeping now. Tap the orb when you need me.", null) { stopEnginesNow() }
            scope.launch { delay(2_600); if (sleeping) stopEnginesNow() }
        } else stopEnginesNow()
    }

    private fun stopEnginesNow() {
        c.stt.cancel()
        c.tts.stop()
        c.wake.stop()
        c.wake.releaseMic()
        setUi(AssistantState.SLEEPING, "shutdown by voice")
        JarvisLog.i("SLEEP: gate + ASR + TTS released — zero background listening")
    }

    fun wakeMode(notifyUi: Boolean = true) {
        sleeping = false
        val cfg = c.settings.current()
        if (cfg.wakeEnabled) {
            c.wake.reacquireMic()
            c.wake.start()
        }
        if (notifyUi) setUi(AssistantState.IDLE, "awake")
    }

    /** Called by the Orchestrator after wake consumed a trigger. */
    fun resumeWakeIfArmed() {
        val cfg = c.settings.current()
        if (!sleeping && cfg.wakeEnabled && JarvisBus.latestState.value == AssistantState.IDLE) {
            c.wake.reacquireMic()
            if (!c.wake.isArmed) c.wake.start()
        }
    }

    /** TTS tail finished → back to standby (used by orchestrator callback). */
    fun speakTailIdle() {
        if (sleeping) return
        if (JarvisBus.latestState.value == AssistantState.SPEAKING) {
            setUi(AssistantState.IDLE, "standby")
            resumeWakeIfArmed()
        }
    }

    private fun teardownEngines() {
        watchdogJob?.cancel(); watchdogJob = null
        settingsJob?.cancel(); settingsJob = null
        eventsJob?.cancel(); eventsJob = null
        c.wake.stop()
        c.wake.releaseMic()
        c.stt.destroy()
        c.tts.stop()
        setUi(AssistantState.SLEEPING, "service stopped")
    }

    // ── power policy ─────────────────────────────────────────────────────────
    private val powerReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_ON -> applyGateFlags()
                Intent.ACTION_SCREEN_OFF -> applyGateFlags()
                Intent.ACTION_POWER_CONNECTED,
                Intent.ACTION_POWER_DISCONNECTED -> {
                    applyGateFlags()
                    degradeForBattery()
                }
            }
        }
    }

    private fun applyGateFlags() {
        val pm = getSystemService(PowerManager::class.java)
        c.gate.screenOn = runCatching { pm?.isInteractive == true }.getOrDefault(true)
        val bm = getSystemService(Context.BATTERY_SERVICE) as? android.app.BatteryManager
        c.gate.charging = runCatching { bm?.isCharging == true }.getOrDefault(false)
    }

    private fun degradeForBattery() {
        val bm = getSystemService(Context.BATTERY_SERVICE) as? android.app.BatteryManager ?: return
        val pct = bm.getIntProperty(android.app.BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val charging = bm.isCharging
        val cfg = c.settings.current()
        val target = when {
            pct <= 15 && !charging && cfg.powerProfile != PowerProfile.SAVER -> PowerProfile.SAVER
            else -> cfg.powerProfile
        }
        c.wake.profile = target
        c.gate.profile = target
    }

    // ── watchdog (self-healing without a crash) ─────────────────────────────
    private fun startWatchdog() {
        watchdogJob = scope.launch {
            while (currentCoroutineContext()[Job]?.isActive != false) {
                delay(12_000)
                SelfHealing.beat()
                if (sleeping) continue
                val state = JarvisBus.latestState.value
                val idleFor = System.currentTimeMillis() - lastActivity

                if (state == AssistantState.LISTENING && idleFor > 35_000) {
                    JarvisLog.w("watchdog: stuck LISTENING ${idleFor / 1000}s → forcing re-arm")
                    c.stt.cancel()
                    setUi(AssistantState.IDLE, "watchdog reset")
                    resumeWakeIfArmed()
                }
                if (state == AssistantState.THINKING && idleFor > 90_000) {
                    JarvisLog.w("watchdog: THINKING stall → idle")
                    setUi(AssistantState.IDLE, "watchdog reset")
                }
                if (state == AssistantState.IDLE && c.settings.current().wakeEnabled &&
                    !c.wake.isArmed && !c.tts.isSpeaking
                ) {
                    JarvisLog.w("watchdog: wake engine died → restart")
                    c.wake.start()
                }
            }
        }
    }

    // ── live settings + bus collectors ──────────────────────────────────────
    private fun collectSettings() {
        settingsJob = scope.launch {
            c.settings.config.collectLatest { cfg ->
                c.wake.sensitivity = cfg.wakeSensitivity
                c.wake.profile = cfg.powerProfile
                c.gate.profile = cfg.powerProfile
                c.tts.refreshPersona()
                if (!cfg.wakeEnabled && !sleeping) {
                    c.wake.stop()
                } else if (cfg.wakeEnabled && !sleeping && JarvisBus.latestState.value == AssistantState.IDLE) {
                    c.wake.reacquireMic()
                    c.wake.start()
                }
                runCatching {
                    if (cfg.overlayEnabled) com.jarvis.assistant.overlay.JarvisOverlayService.start(this@JarvisService)
                    else com.jarvis.assistant.overlay.JarvisOverlayService.stop(this@JarvisService)
                }
            }
        }
    }

    private fun collectEvents() {
        eventsJob = scope.launch {
            JarvisBus.events.collect { e ->
                lastActivity = System.currentTimeMillis()
                when (e) {
                    is JarvisEvent.StateChanged -> updateNotification(e.state)
                    is JarvisEvent.Speaking -> if (!e.speaking) speakTailIdle()
                    else -> Unit
                }
            }
        }
    }

    // ── notification ─────────────────────────────────────────────────────────
    private fun setUi(state: AssistantState, detail: String) {
        JarvisBus.post(JarvisEvent.StateChanged(state, detail))
    }

    private fun buildNotification(state: AssistantState): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, com.jarvis.assistant.MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val toggle = PendingIntent.getService(
            this, 1,
            Intent(if (state == AssistantState.SLEEPING) ACTION_WAKE else ACTION_SLEEP)
                .setClassName(packageName, JarvisService::class.java.name),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this, 2,
            Intent(ACTION_STOP).setClassName(packageName, JarvisService::class.java.name),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stateText = when (state) {
            AssistantState.IDLE -> getString(R.string.state_idle)
            AssistantState.LISTENING -> getString(R.string.state_listening)
            AssistantState.THINKING -> getString(R.string.state_thinking)
            AssistantState.SPEAKING -> getString(R.string.state_speaking)
            AssistantState.SLEEPING -> getString(R.string.state_sleeping)
            AssistantState.ERROR -> getString(R.string.state_error)
        }
        return NotificationCompat.Builder(this, NotificationChannels.CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_stat_jarvis)
            .setContentTitle(getString(R.string.notif_service_title, state.name.lowercase().replaceFirstChar { it.uppercase() }))
            .setContentText(stateText)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(open)
            .addAction(0, getString(R.string.notif_action_open), open)
            .addAction(0, getString(R.string.notif_action_pause), toggle)
            .addAction(0, "Stop", stop)
            .build()
    }

    private fun updateNotification(state: AssistantState) {
        runCatching {
            val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.notify(NOTIF_ID, buildNotification(state))
        }
    }

    private fun startForegroundCompat(n: Notification) {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(NOTIF_ID, n)
            }
        }.onFailure {
            JarvisLog.e("startForeground failed (system denial?) — service may stop", it)
            stopSelf()
        }
    }
}

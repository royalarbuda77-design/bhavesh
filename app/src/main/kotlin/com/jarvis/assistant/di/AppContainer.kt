package com.jarvis.assistant.di

import android.annotation.SuppressLint
import android.content.Context
import com.jarvis.assistant.automation.router.CommandRouter
import com.jarvis.assistant.automation.utilities.ReminderScheduler
import com.jarvis.assistant.automation.utilities.ReminderStore
import com.jarvis.assistant.core.config.SettingsRepository
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.memory.ConversationStore
import com.jarvis.assistant.core.memory.UserMemory
import com.jarvis.assistant.core.util.NetworkMonitor
import com.jarvis.assistant.gemini.GeminiClient
import com.jarvis.assistant.voice.Sfx
import com.jarvis.assistant.voice.gate.AudioGate
import com.jarvis.assistant.voice.stt.SttEngine
import com.jarvis.assistant.voice.tts.GeminiTtsEngine
import com.jarvis.assistant.voice.tts.SystemTtsEngine
import com.jarvis.assistant.voice.tts.TtsManager
import com.jarvis.assistant.voice.wake.SttWakeEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * Hand-wired dependency graph — one instance per process, created in
 * Application.onCreate. Chosen over Hilt/Dagger deliberately: zero annotation
 * processors to version-match, instant startup, and obvious lifecycle
 * ownership (everything lives exactly as long as the process).
 */
@SuppressLint("MissingPermission") // mic APIs are permission-gated at runtime by the wizard
class AppContainer(appContext: Context, bakedApiKey: String?) {

    val app: Context = appContext.applicationContext

    val settings: SettingsRepository = SettingsRepository.init(app, bakedApiKey)
    val net: NetworkMonitor = NetworkMonitor(app)
    val conversation: ConversationStore = ConversationStore(app)
    val memory: UserMemory = UserMemory(app)

    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default + SelfHealing.handler)

    // ── AI layer ─────────────────────────────────────────────────────────────
    val gemini: GeminiClient = GeminiClient(settings)

    // ── voice pipeline ───────────────────────────────────────────────────────
    val stt: SttEngine = SttEngine(app)
    val gate: AudioGate = AudioGate(app)
    val wake: SttWakeEngine = SttWakeEngine(app, settings, gate, stt)
    private val systemTts: SystemTtsEngine = SystemTtsEngine(app, settings)
    private val cloudTts: GeminiTtsEngine = GeminiTtsEngine(gemini) {
        settings.current().cloudVoiceName
    }
    val tts: TtsManager = TtsManager(app, settings, systemTts, cloudTts) { net.isOnline() }

    // ── device automation ─────────────────────────────────────────────────────
    val reminderStore: ReminderStore = ReminderStore(app)
    val reminders: ReminderScheduler = ReminderScheduler(app, reminderStore)

    val router: CommandRouter = CommandRouter(app, settings, memory, net)

    // ── orchestration (created after service so it can command modes) ────────
    val orchestrator: Orchestrator by lazy { Orchestrator(this) }

    fun playSfx(cue: Sfx.Cue) {
        if (settings.current().soundFx) Sfx.play(app, cue)
    }

    fun notifyUiRestart() {
        JarvisLog.i("config changed — engines re-synced by service collector")
    }
}

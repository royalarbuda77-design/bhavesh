package com.jarvis.assistant.core.config

import android.content.Context
import android.content.SharedPreferences
import com.jarvis.assistant.core.security.CryptoStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Single source of truth for user configuration.
 *
 *  • Fast, synchronous reads via the [config] StateFlow (audio code uses it lock-free).
 *  • Writes funnel through [edit] → SharedPreferences.
 *  • The Gemini API key is persisted separately, Keystore-encrypted (CryptoStore).
 *
 * @param bakedApiKey optional key injected at build time (local.properties /
 *                    env JARVIS_API_KEY) — used only if the user hasn't set one.
 */
class SettingsRepository private constructor(
    private val appContext: Context,
    private val prefs: SharedPreferences,
    bakedApiKey: String?
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Any()

    private val _config = MutableStateFlow(build())
    val config: StateFlow<JarvisConfig> = _config.asStateFlow()

    /** Synchronous accessor for non-suspending audio code. */
    fun current(): JarvisConfig = _config.value

    init {
        prefs.registerOnSharedPreferenceChangeListener { _, key ->
            // The API key arrives through setApiKey(); ignore its pref callback
            // to avoid clobbering the in-memory value with a decrypt race.
            if (key != null && key != KEY_API_ENC) refresh()
        }
        // One-time seeding of a build-time key.
        if (!bakedApiKey.isNullOrBlank() && _config.value.geminiApiKey.isBlank()) {
            setApiKey(bakedApiKey)
        }
    }

    fun edit(block: (JarvisConfig) -> JarvisConfig) {
        synchronized(lock) {
            val updated = block(current())
            persist(updated)
            _config.value = updated.copy(geminiApiKey = readKey()) // keep canonical key source
        }
    }

    /** API key has a dedicated setter because its storage is encrypted. */
    fun setApiKey(key: String) {
        val trimmed = key.trim()
        scope.launch {
            if (trimmed.isEmpty()) {
                prefs.edit().remove(KEY_API_ENC).apply()
            } else {
                prefs.edit().putString(KEY_API_ENC, CryptoStore.protect(trimmed)).apply()
            }
        }
        synchronized(lock) {
            _config.value = current().copy(geminiApiKey = trimmed)
        }
    }

    fun forgetApiKey() {
        scope.launch {
            prefs.edit().remove(KEY_API_ENC).apply()
            runCatching { CryptoStore.wipeKey(appContext) }
        }
        synchronized(lock) {
            _config.value = current().copy(geminiApiKey = "")
        }
    }

    private fun refresh() {
        synchronized(lock) { _config.value = build() }
    }

    private fun readKey(): String =
        prefs.getString(KEY_API_ENC, null)?.let { CryptoStore.unprotect(it) }.orEmpty()

    private fun build(): JarvisConfig = JarvisConfig(
        geminiApiKey = readKey(),
        apiBaseUrl = prefs.getString(KEY_BASE_URL, JarvisConfig.DEFAULT_BASE_URL)!!,
        chatModel = prefs.getString(KEY_MODEL, "auto")!!,
        ttsBackend = enumOr(KEY_TTS_BACKEND, TtsBackend.SYSTEM),
        voiceStyle = enumOr(KEY_VOICE_STYLE, VoiceStyle.DEEP_MALE),
        cloudVoiceName = prefs.getString(KEY_CLOUD_VOICE, CloudVoices.DEEP_MALE)!!,
        sttLanguage = prefs.getString(KEY_STT_LANG, "auto")!!,
        replyLanguage = prefs.getString(KEY_REPLY_LANG, "auto")!!,
        wakeEnabled = prefs.getBoolean(KEY_WAKE_ENABLED, true),
        wakeBackend = enumOr(KEY_WAKE_BACKEND, WakeBackend.GATE_STT),
        wakeSensitivity = prefs.getInt(KEY_WAKE_SENS, 2).coerceIn(1, 3),
        customWakePhrase = prefs.getString(KEY_WAKE_CUSTOM, "")!!,
        powerProfile = enumOr(KEY_POWER, PowerProfile.BALANCED),
        overlayEnabled = prefs.getBoolean(KEY_OVERLAY, false),
        overlayShowOnLockscreen = prefs.getBoolean(KEY_OVERLAY_LOCK, false),
        soundFx = prefs.getBoolean(KEY_SFX, true),
        bargeInEnabled = prefs.getBoolean(KEY_BARGE, true),
        autoStartOnBoot = prefs.getBoolean(KEY_BOOT, true),
        systemActionsEnabled = prefs.getBoolean(KEY_SYS_ACTIONS, true),
        memoryEnabled = prefs.getBoolean(KEY_MEMORY, true),
        searchGrounding = prefs.getBoolean(KEY_SEARCH, false),
        temperature = prefs.getFloat(KEY_TEMP, 0.5f),
        maxHistoryTurns = prefs.getInt(KEY_HISTORY, 12),
        agentModeAlways = prefs.getBoolean(KEY_AGENT_ALWAYS, true)
    )

    private inline fun <reified T : Enum<T>> enumOr(prefKey: String, fallback: T): T =
        runCatching { enumValueOf<T>(prefs.getString(prefKey, null)!!) }.getOrDefault(fallback)

    private fun persist(cfg: JarvisConfig) {
        prefs.edit().apply {
            putString(KEY_BASE_URL, cfg.apiBaseUrl)
            putString(KEY_MODEL, cfg.chatModel)
            putString(KEY_TTS_BACKEND, cfg.ttsBackend.name)
            putString(KEY_VOICE_STYLE, cfg.voiceStyle.name)
            putString(KEY_CLOUD_VOICE, cfg.cloudVoiceName)
            putString(KEY_STT_LANG, cfg.sttLanguage)
            putString(KEY_REPLY_LANG, cfg.replyLanguage)
            putBoolean(KEY_WAKE_ENABLED, cfg.wakeEnabled)
            putString(KEY_WAKE_BACKEND, cfg.wakeBackend.name)
            putInt(KEY_WAKE_SENS, cfg.wakeSensitivity)
            putString(KEY_WAKE_CUSTOM, cfg.customWakePhrase)
            putString(KEY_POWER, cfg.powerProfile.name)
            putBoolean(KEY_OVERLAY, cfg.overlayEnabled)
            putBoolean(KEY_OVERLAY_LOCK, cfg.overlayShowOnLockscreen)
            putBoolean(KEY_SFX, cfg.soundFx)
            putBoolean(KEY_BARGE, cfg.bargeInEnabled)
            putBoolean(KEY_BOOT, cfg.autoStartOnBoot)
            putBoolean(KEY_SYS_ACTIONS, cfg.systemActionsEnabled)
            putBoolean(KEY_MEMORY, cfg.memoryEnabled)
            putBoolean(KEY_SEARCH, cfg.searchGrounding)
            putFloat(KEY_TEMP, cfg.temperature)
            putInt(KEY_HISTORY, cfg.maxHistoryTurns)
            putBoolean(KEY_AGENT_ALWAYS, cfg.agentModeAlways)
            apply()
        }
    }

    companion object {
        const val PREFS_NAME = "jarvis_settings"

        @Volatile
        private var instance: SettingsRepository? = null

        fun init(context: Context, bakedApiKey: String?): SettingsRepository =
            instance ?: synchronized(this) {
                instance ?: SettingsRepository(
                    context.applicationContext,
                    context.applicationContext
                        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE),
                    bakedApiKey
                ).also { instance = it }
            }

        fun get(): SettingsRepository = instance
            ?: error("SettingsRepository.init() must be called from Application.onCreate")

        private const val KEY_API_ENC = "api_key_enc"
        private const val KEY_BASE_URL = "api_base_url"
        private const val KEY_MODEL = "chat_model"
        private const val KEY_TTS_BACKEND = "tts_backend"
        private const val KEY_VOICE_STYLE = "voice_style"
        private const val KEY_CLOUD_VOICE = "cloud_voice"
        private const val KEY_STT_LANG = "stt_language"
        private const val KEY_REPLY_LANG = "reply_language"
        private const val KEY_WAKE_ENABLED = "wake_enabled"
        private const val KEY_WAKE_BACKEND = "wake_backend"
        private const val KEY_WAKE_SENS = "wake_sensitivity"
        private const val KEY_WAKE_CUSTOM = "wake_custom"
        private const val KEY_POWER = "power_profile"
        private const val KEY_OVERLAY = "overlay_enabled"
        private const val KEY_OVERLAY_LOCK = "overlay_lockscreen"
        private const val KEY_SFX = "sound_fx"
        private const val KEY_BARGE = "barge_in"
        private const val KEY_BOOT = "auto_start_boot"
        private const val KEY_SYS_ACTIONS = "system_actions"
        private const val KEY_MEMORY = "memory_enabled"
        private const val KEY_SEARCH = "search_grounding"
        private const val KEY_TEMP = "temperature"
        private const val KEY_HISTORY = "max_history"
        private const val KEY_AGENT_ALWAYS = "agent_mode_always"
    }
}

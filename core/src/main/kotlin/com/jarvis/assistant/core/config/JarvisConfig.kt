package com.jarvis.assistant.core.config

/**
 * Immutable snapshot of every user-tunable knob. Stored in SharedPreferences;
 * only [geminiApiKey] is Keystore-encrypted via CryptoStore.
 */
data class JarvisConfig(
    val geminiApiKey: String = "",
    val apiBaseUrl: String = DEFAULT_BASE_URL,

    /** "auto" → ModelCatalog probes the list & remembers what worked. */
    val chatModel: String = "auto",

    val ttsBackend: TtsBackend = TtsBackend.SYSTEM,
    val voiceStyle: VoiceStyle = VoiceStyle.DEEP_MALE,
    /** Only used when ttsBackend == CLOUD_GEMINI. */
    val cloudVoiceName: String = CloudVoices.DEEP_MALE,

    /** STT locale: "auto" | "gu-IN" | "hi-IN" | "en-IN" | "en-US". */
    val sttLanguage: String = "auto",
    /** Language Jarvis should reply in: "auto" (mirror user) | "gu" | "hi" | "en". */
    val replyLanguage: String = "auto",

    val wakeEnabled: Boolean = true,
    val wakeBackend: WakeBackend = WakeBackend.GATE_STT,
    /** 1..3 — higher = more sensitive (more false wakes). */
    val wakeSensitivity: Int = 2,
    /** Custom primary wake phrase appended to the built-in variants. */
    val customWakePhrase: String = "",

    val powerProfile: PowerProfile = PowerProfile.BALANCED,
    val overlayEnabled: Boolean = false,
    val overlayShowOnLockscreen: Boolean = false,

    val soundFx: Boolean = true,
    val bargeInEnabled: Boolean = true,
    val autoStartOnBoot: Boolean = true,
    val systemActionsEnabled: Boolean = true,
    val memoryEnabled: Boolean = true,
    val searchGrounding: Boolean = false,
    val temperature: Float = 0.5f,
    val maxHistoryTurns: Int = 12,

    /** When true every utterance is analysed by Gemini for possible device actions. */
    val agentModeAlways: Boolean = true
) {
    val hasApiKey: Boolean get() = geminiApiKey.isNotBlank()

    companion object {
        const val DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

        /**
         * Accept BOTH classic `AIza…` keys and the new `AQ.…` keys issued by
         * AI Studio since 2026 — the format differs but both authenticate the
         * same way (`x-goog-api-key` header). Deliberately permissive: only
         * shape is checked here, real validation is a live `GET /models` probe
         * from GeminiClient (Settings → "Test key").
         */
        fun looksLikeValidKeyFormat(key: String): Boolean {
            val k = key.trim()
            return k.length >= 20 && k.none { it.isWhitespace() }
        }
    }
}

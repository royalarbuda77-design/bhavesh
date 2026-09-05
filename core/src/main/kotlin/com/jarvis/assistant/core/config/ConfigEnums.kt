package com.jarvis.assistant.core.config

/** Which text-to-speech engine renders Jarvis's voice. */
enum class TtsBackend(val label: String) {
    /** On-device Android TextToSpeech (offline-capable, zero cost). */
    SYSTEM("Device TTS"),

    /** Gemini neural TTS (needs internet, dramatically better quality). */
    CLOUD_GEMINI("Gemini Neural TTS")
}

/** Voice personas. Mapped to device TTS voice + pitch/rate on SYSTEM, or a Gemini voice on CLOUD. */
enum class VoiceStyle(val label: String) {
    DEEP_MALE("Jarvis — Deep Male"),
    ROBOTIC("Arc Reactor — Robotic"),
    NATURAL_FEMALE("Friday — Natural Female")
}

/** Prebuilt Gemini TTS voice names per style (docs: ai.google.dev/gemini-api/docs/speech-generation). */
object CloudVoices {
    const val DEEP_MALE = "Charon"        // informative, low, calm
    const val ROBOTIC = "Fenrir"          // crisp, slightly metallic
    const val NATURAL_FEMALE = "Aoede"    // breezy female
    val ALL = listOf(
        "Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr",
        "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algenib",
        "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Sulafat", "Algenib "
    )
}

/** Battery / responsiveness trade-off for the always-listening pipeline. */
enum class PowerProfile(val label: String) {
    /** Mic gate always open — fastest wake response. */
    AGGRESSIVE("Performance"),

    /** Gate open while screen-on; duty-cycled (~1.2 s every 2.4 s) when screen-off & uncharged. */
    BALANCED("Balanced (recommended)"),

    /** Gate duty-cycled always; STT wake verification only in the open windows. */
    SAVER("Battery Saver")
}

/** Wake engine selection. GATE_STT needs no SDK, no key, works offline on stock Android. */
enum class WakeBackend(val label: String) {
    GATE_STT("Built-in (Audio Gate + ASR verify)"),
    PORCUPTINE("Picovoice Porcupine (optional, see docs/WAKE_WORD.md)")
}

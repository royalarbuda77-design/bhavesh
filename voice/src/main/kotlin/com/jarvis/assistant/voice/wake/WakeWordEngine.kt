package com.jarvis.assistant.voice.wake

import com.jarvis.assistant.core.config.PowerProfile

/**
 * Pluggable wake-word detection. Two shipped backends:
 *  • [SttWakeEngine]  — zero-dependency (Audio Gate → constrained ASR verify),
 *                       works offline, handles "જારવિસ/jarvis/jervis" mis-hearings.
 *  • PorcupineWakeEngine — optional on-device neural KWS (docs/WAKE_WORD.md),
 *                       enabled with -Pjarvis.engines.porcupine=true.
 */
interface WakeWordEngine {
    val name: String
    var onWake: () -> Unit
    var onSleepRequested: () -> Unit
    var onStopSpeaking: () -> Unit
    var sensitivity: Int          // 1..3
    var profile: PowerProfile
    fun start()
    fun stop()

    /** Short cooldown after our own TTS / after handling a command. */
    fun holdOff(ms: Long)
}

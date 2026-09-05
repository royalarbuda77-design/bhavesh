package com.jarvis.assistant.core.state

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** High-level lifecycle state of the assistant — drives HUD colours, animation and audio cues. */
enum class AssistantState {
    /** Service alive, wake-word gate armed, waiting for "Wake up Jarvis". */
    IDLE,

    /** Microphone actively transcribing the user's command. */
    LISTENING,

    /** Request in flight to Gemini (or local executor). */
    THINKING,

    /** Text-to-speech playback in progress. */
    SPEAKING,

    /** "Shutdown Jarvis" — every listening engine suspended, near-zero battery. */
    SLEEPING,

    /** Recoverable fault; self-healing is working. */
    ERROR
}

enum class NoticeLevel { INFO, WARN, ERROR, HEALED }

/** Everything the UI / HUD / overlay may render. One broadcast flow, no coupling. */
sealed interface JarvisEvent {
    data class StateChanged(val state: AssistantState, val detail: String = "") : JarvisEvent
    data class PartialTranscript(val text: String) : JarvisEvent
    data class UserUtterance(val text: String, val confidence: Float = 1f) : JarvisEvent
    data class JarvisText(val text: String, val final: Boolean = true) : JarvisEvent
    data class ActionDone(val name: String, val ok: Boolean, val message: String = "") : JarvisEvent
    data class Notice(val level: NoticeLevel, val message: String) : JarvisEvent
    data object Wake : JarvisEvent
    data class Speaking(val speaking: Boolean) : JarvisEvent
}

/**
 * Ultra-light event bus. `tryEmit` semantics: never suspends, never blocks the audio
 * pipeline; the buffer simply drops the oldest event under pressure (UI catches up on
 * resubscribe via [JarvisBus.latestState]).
 */
object JarvisBus {
    private val _events = MutableSharedFlow<JarvisEvent>(
        replay = 0,
        extraBufferCapacity = 256,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val events: SharedFlow<JarvisEvent> = _events

    private val _state = MutableStateFlow(AssistantState.SLEEPING)
    val latestState: StateFlow<AssistantState> = _state.asStateFlow()

    fun post(event: JarvisEvent) {
        _events.tryEmit(event)
        if (event is JarvisEvent.StateChanged) _state.value = event.state
    }
}

/** Normalised microphone amplitude (0f..1f) — feeds the Arc-Reactor HUD reactivity. */
object JarvisLevels {
    private val _amplitude = MutableStateFlow(0f)
    val amplitude: StateFlow<Float> = _amplitude.asStateFlow()

    /** Called from the audio gate / STT layer at ~20 Hz max. */
    fun set(level: Float) {
        val clamped = level.coerceIn(0f, 1f)
        // Smooth a little so the HUD doesn't jitter.
        val smoothed = (_amplitude.value * 0.55f) + (clamped * 0.45f)
        _amplitude.value = smoothed
    }

    fun decay() {
        _amplitude.value = (_amplitude.value * 0.82f).coerceAtLeast(0f)
    }
}

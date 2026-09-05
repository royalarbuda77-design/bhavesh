package com.jarvis.assistant.core.nlu

/** Domains the offline NLU understands without any network round-trip. */
enum class NluDomain {
    SYSTEM,       // wifi, bluetooth, torch, brightness, dnd …
    APP,          // open/close app
    MEDIA,        // play/pause/next, youtube, spotify
    CALL,         // dial
    MESSAGE,      // whatsapp / sms text
    EMAIL,        // draft & send email
    SMS,          // pure SMS
    CLOCK,        // alarm, timer, stopwatch
    CALENDAR,     // calendar events
    REMINDER,     // local reminders (Jarvis-owned)
    REPORT,       // battery / storage / memory / device info
    NOTIFICATION, // read / dismiss notifications
    NOTE,         // remember / say note
    SCREEN,       // "what's written here", read screen, describe screen
    NAVIGATION,   // maps: go / directions to
    CONTROL,      // back / home / scroll (accessibility gestures)
    WAKE,         // wake / shutdown / stop-speaking / push-to-talk
    CHAT          // anything else — free-form LLM conversation
}

enum class NluOp { ON, OFF, TOGGLE, SET, OPEN, CLOSE, PLAY, PAUSE, NEXT, PREV, READ, WRITE, STATUS, BACK, HOME, UP, DOWN, CLEAR, LIST, ADD, DELETE, UNKNOWN }

data class NluIntent(
    val domain: NluDomain,
    val op: NluOp,
    /** domain-specific slots: setting=, target=, value=, name=, query=, number= … */
    val slots: Map<String, String> = emptyMap(),
    val rawUtterance: String = ""
)

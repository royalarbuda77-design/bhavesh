package com.jarvis.assistant.gemini

/**
 * The catalog of Gemini models Jarvis will try, in order.
 *
 * Why a list instead of one hard-coded name: model ids churn every few months
 * (2.0 → 2.5 → newer), and a 404 on a single hard-coded id would brick the
 * product. The client probes this list, remembers the first model that works,
 * and re-probes after back-off — a small piece of the self-healing philosophy
 * applied to the API surface itself.
 */
object ModelCatalog {

    /** Chat / vision / agent-parsing models (multimodal input + JSON schema output). */
    val CHAT_CANDIDATES = listOf(
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
        "gemini-flash-latest"
    )

    /** Gemini neural text-to-speech models. */
    val TTS_CANDIDATES = listOf(
        "gemini-3.1-flash-tts-preview",
        "gemini-2.5-flash-preview-tts"
    )

    fun chatList(preferred: String?): List<String> {
        val p = preferred?.trim()?.takeIf { it.isNotEmpty() && !it.equals("auto", true) }
        return if (p == null) CHAT_CANDIDATES
        else (listOf(p) + CHAT_CANDIDATES).distinct()
    }

    fun ttsList(preferred: String? = null): List<String> {
        val p = preferred?.trim()?.takeIf { it.isNotEmpty() && !it.equals("auto", true) }
        return if (p == null) TTS_CANDIDATES
        else (listOf(p) + TTS_CANDIDATES).distinct()
    }
}

package com.jarvis.assistant.voice.tts

/** Minimal contract both speech backends satisfy. */
interface TtsEngine {
    val id: String

    /** Warm-up hook (create native engine, load voices). Idempotent. */
    fun prepare() {}

    suspend fun speak(text: String, langHint: String?, utteranceId: String): Boolean

    fun stopAll()

    fun release() { stopAll() }
}

/** Sentence segmentation tuned for TTS (works across Latin/Gujarati/Hindi). */
object SentenceSplit {
    private val terminal = Regex("""(?<=[।॥.!?])\s+""")

    fun split(text: String): List<String> {
        val cleaned = text.replace(Regex("\\s+"), " ").trim()
        if (cleaned.isEmpty()) return emptyList()
        val parts = terminal.split(cleaned).map { it.trim() }.filter { it.isNotEmpty() }
        // merge tiny fragments to keep prosody natural
        val merged = ArrayList<String>()
        for (p in parts) {
            val last = merged.lastOrNull()
            if (last != null && (last.length < 14 || p.length < 8)) {
                merged[merged.size - 1] = "$last $p"
            } else merged.add(p)
        }
        // hard-cap very long "sentences" (ASR/LLM output) so playback feels responsive
        return merged.flatMap { piece ->
            if (piece.length <= 220) listOf(piece)
            else piece.chunked(200).map { it.trimEnd() }.filter { it.isNotBlank() }
        }
    }
}

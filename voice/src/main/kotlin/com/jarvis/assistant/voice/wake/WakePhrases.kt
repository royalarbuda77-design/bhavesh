package com.jarvis.assistant.voice.wake

import com.jarvis.assistant.core.nlu.Lexicon
import com.jarvis.assistant.core.util.TextNorm

/**
 * Vocabulary fed to the constrained-ASR wake verifier, and fuzzy scoring that
 * accepts ASR mis-hearings of "Jarvis" in three scripts.
 */
object WakePhrases {

    /** EXTRA_LANGUAGE_PHRASE-friendly list (each ≤ 100 chars, ≤ 28 lines). */
    fun grammar(custom: String): List<String> {
        val base = buildList {
            add("wake up jarvis")
            add("hey jarvis")
            add("hello jarvis")
            add("jarvis")
            add("jervis")
            add("shutdown jarvis")
            add("jarvis shutdown")
            add("jarvis sleep")
            add("so jao jarvis")
            add("stop")
            add("stop jarvis")
            add("જારવિસ")
            add("wake up jarvis sir")
            add("jarvis on")
            if (custom.isNotBlank()) add(TextNorm.collapse(custom.lowercase()).take(100))
        }.map { TextNorm.collapse(it) }
            .filter { it.isNotBlank() && it.length in 2..100 }
            .distinct()
        return base.take(28)
    }

    /** Fuzzy wake check — tolerant to Gujarati script, Devanagari, and mis-hearings. */
    fun matchesWake(utterance: String, custom: String, sensitivity: Int): Boolean {
        val u = TextNorm.normalize(utterance)
        if (u.isBlank()) return false

        if (custom.isNotBlank()) {
            val c = TextNorm.normalize(custom)
            if (c.isNotBlank() && u.contains(c)) return true
        }
        if (Lexicon.anyMatch(u, Lexicon.wakeUpPhrases)) return true

        val variants = Lexicon.wakeVariants
        val maxDist = when (sensitivity) {
            1 -> 1
            2 -> 1
            else -> 2
        }
        val tokens = u.split(' ')
        return tokens.any { t ->
            variants.any { v ->
                t == v || (t.length >= 4 && TextNorm.editDistance(t, v, maxDist + 1) <=
                    if (v.length <= 5) maxDist else maxDist + 1)
            }
        }
    }

    fun matchesShutdown(utterance: String): Boolean =
        Lexicon.anyMatch(TextNorm.normalize(utterance), Lexicon.shutdownPhrases)

    fun matchesStopSpeaking(utterance: String): Boolean =
        Lexicon.anyMatch(TextNorm.normalize(utterance), Lexicon.stopSpeakingPhrases)
}

package com.jarvis.assistant.core.util

import java.util.Locale

/**
 * Script- and language-aware normalisation used by every NLU layer.
 * Handles Gujarati, Devanagari (Hindi) and Latin, including spoken-language
 * digits ("પાંચ" / "five" / "٥") and STT mis-hearings of "Jarvis".
 */
object TextNorm {

    fun normalize(raw: String): String {
        var s = raw.lowercase(Locale.ROOT).trim()
        s = s.replace(Regex("[.!?,;:\"'`\\-–—_\\[\\]{}()]+"), " ")
        s = collapse(s)
        return s
    }

    fun collapse(s: String): String = s.trim().replace(Regex("\\s+"), " ")

    fun toLatinDigits(s: String): String {
        val sb = StringBuilder(s.length)
        for (c in s) {
            sb.append(
                when {
                    c in '૦'..'૯' -> ('0' + (c - '૦'))
                    c in '०'..'९' -> ('0' + (c - '०'))
                    c in '۰'..'۹' -> ('0' + (c - '۰'))
                    else -> c
                }
            )
        }
        return sb.toString()
    }

    fun hasGujarati(s: String): Boolean = s.any { it in '઀'..'૿' }
    fun hasDevanagari(s: String): Boolean = s.any { it in 'ऀ'..'ॿ' }

    /** Rough language-of-dominant-script detection. */
    fun detectLang(s: String): String = when {
        hasGujarati(s) -> "gu"
        hasDevanagari(s) -> "hi"
        else -> "en"
    }

    /** "કલાક" style postpositional noise removal for slot extraction. */
    fun stripFillers(s: String): String {
        val fillers = listOf(
            "please", "pls", "કૃપા", "કૃપા કરીને", "મહેરબાની", "મહેરબાની કરીને",
            "જરા", "ના", "હો જાય", "કર દે", "કરી દે", "chalana", "kripa karine"
        )
        var out = s
        fillers.forEach { f -> out = out.replace(" $f ", " ") }
        return collapse(out)
    }

    /** Bounded Levenshtein — used to forgive ASR errors like jarvis/jervis/charvis. */
    fun editDistance(a: String, b: String, max: Int = 3): Int {
        if (a == b) return 0
        if (kotlin.math.abs(a.length - b.length) > max) return max + 1
        val n = a.length; val m = b.length
        var prev = IntArray(m + 1) { it }
        var cur = IntArray(m + 1)
        for (i in 1..n) {
            cur[0] = i
            var rowMin = cur[0]
            for (j in 1..m) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                cur[j] = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
                if (cur[j] < rowMin) rowMin = cur[j]
            }
            if (rowMin > max) return max + 1
            val t = prev; prev = cur; cur = t
        }
        return prev[m].coerceAtMost(max + 1)
    }

    /** True if any token of [haystack] fuzzy-matches [needle]. */
    fun fuzzyTokenMatch(haystack: String, needle: String, distance: Int = 1): Boolean {
        val n = needle.trim()
        if (n.isEmpty()) return false
        if (haystack.contains(n)) return true
        val max = if (n.length <= 4) 1 else distance
        return haystack.split(' ').any { token -> editDistance(token, n, max) <= max }
    }

    /** Does the transcript plausibly address Jarvis? (wake verification logic). */
    fun addressedToJarvis(transcript: String, variants: List<String>): Boolean {
        val norm = collapse(toLatinDigits(normalize(transcript)))
        return variants.any { variant -> fuzzyTokenMatch(norm, variant, if (variant.length > 6) 2 else 1) }
    }
}

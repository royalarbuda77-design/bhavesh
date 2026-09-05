package com.jarvis.assistant.core.util

/**
 * Spoken-number comprehension in Gujarati / Hindi / English (+ romanised
 * transliterations, since ASR sometimes emits Latin script for Indian speech).
 * Handles 0–99, "સાડે ત્રણ / पौने पाँच / five thirty" style times via [ClockWords].
 */
object NumberWords {

    private val ones = mapOf(
        // English
        "zero" to 0, "one" to 1, "two" to 2, "three" to 3, "four" to 4, "five" to 5,
        "six" to 6, "seven" to 7, "eight" to 8, "nine" to 9, "ten" to 10,
        "eleven" to 11, "twelve" to 12, "thirteen" to 13, "fourteen" to 14, "fifteen" to 15,
        "sixteen" to 16, "seventeen" to 17, "eighteen" to 18, "nineteen" to 19, "a" to 1, "an" to 1, "dozen" to 12,
        // Tens (English)
        "twenty" to 20, "thirty" to 30, "forty" to 40, "fourty" to 40, "fifty" to 50, "sixty" to 60,
        "seventy" to 70, "eighty" to 80, "ninty" to 90, "ninety" to 90,
        // Gujarati
        "શૂન્ય" to 0, "એક" to 1, "બે" to 2, "ત્રણ" to 3, "ચાર" to 4, "પાંચ" to 5, "પાચ" to 5,
        "છ" to 6, "છય" to 6, "સાત" to 7, "આઠ" to 8, "નવ" to 9, "નવું" to 9, "દસ" to 10,
        "અગિયાર" to 11, "બાર" to 12, "તેર" to 13, "ચૌદ" to 14, "પંદર" to 15, "સોળ" to 16,
        "હતર" to 17, "અઠર" to 18, " ઓગણીસ" to 19, "ઓગણીસ" to 19, "વીસ" to 20,
        "ત્રીસ" to 30, "ચાળીસ" to 40, "પચાસ" to 50, "साઠ" to 60, "છાસ" to 60,
        "સાત્તાવન" to 70, "સાતપન" to 70, "અઠ્યાવન" to 80, "ઓગણ્યા" to 90,
        // Hindi
        "शून्य" to 0, "एक" to 1, "दो" to 2, "तीन" to 3, "चार" to 4, "पांच" to 5, "पाँच" to 5,
        "छह" to 6, "सात" to 7, "आठ" to 8, "नौ" to 9, "दस" to 10, "ग्यारह" to 11, "बारह" to 12,
        "तेरह" to 13, "चौदह" to 14, "पंद्रह" to 15, "सोलह" to 16, "सत्रह" to 17, "अठारह" to 18,
        "उन्नीस" to 19, "बीस" to 20, "तीस" to 30, "चालीस" to 40, "पचास" to 50, "साठ" to 60,
        "सत्तर" to 70, "अस्सी" to 80, "नब्बे" to 90, "सौ" to 100,
        // Transliterations (common when STT language mismatches)
        "ek" to 1, "be" to 2, "do" to 2, "teen" to 3, "char" to 4, "panch" to 5, "paanch" to 5,
        "chhe" to 6, "chay" to 6, "aat" to 7, "aath" to 8, "aattha" to 8, "nav" to 9, "nau" to 9,
        "das" to 10, "gyarah" to 11, "baarah" to 12, "gisht" to 13, "sola" to 16, "bars" to 12,
        "vis" to 20, "bees" to 20, "tees" to 30, "tris" to 30, "chaalees" to 40, "calis" to 40,
        "pachaas" to 50, "pachas" to 50, "saath" to 60, "saat" to 7
    )

    /** Parse a spoken or written number (0..999) from a fragment; digits win. */
    fun parse(fragmentIn: String): Int? {
        val fragment = TextNorm.toLatinDigits(fragmentIn.lowercase().trim())
        fragment.toIntOrNull()?.let { if (it in 0..999) return it }

        val tokens = fragment.split(' ').filter { it.isNotBlank() }
        if (tokens.isEmpty()) return null

        // single token fast path
        if (tokens.size == 1) return ones[tokens[0]]

        // compound english: "twenty five"
        var total = 0
        var matched = false
        for (t in tokens) {
            val v = ones[t]
            if (v != null) { total += v; matched = true } else if (t == "and") continue else return null
        }
        return if (matched && total in 0..999) total else null
    }

    /** All numbers appearing in text, in order (for multi-slot commands). */
    fun all(textIn: String): List<Int> {
        val text = TextNorm.toLatinDigits(textIn.lowercase())
        val out = ArrayList<Int>()
        text.split(Regex("\\s+")).forEach { w -> w.toIntOrNull()?.let { out += it } }
        return out
    }
}

package com.jarvis.assistant.core.util

import java.util.Calendar

/**
 * "ઉકાળે સાત વાગ્યે", "सुबह सात बजे", "tomorrow 6:45 am", "પચીસ મિનિટ પછી" …
 * Extracts a wall-clock time, a duration, and day offsets from free-form speech.
 * Returns [TimeGuess] with confidence so the orchestrator can ask a follow-up
 * when it is ambiguous ("શું તમે AM મતલબ કરો છો?").
 */
object ClockWords {

    data class TimeGuess(
        val hour: Int,
        val minute: Int,
        val amPmResolved: Boolean,
        val dayOffset: Int = 0
    )

    private val pmWords = setOf(
        "pm", "સાંજે", "રાત્રે", "ರಾತ್ರಿ", "सान्झ", "raatre", "sanje", "sanje", "evening", "night", "रात", "दोपहर बाद"
    )
    private val amWords = setOf(
        "am", "સવારે", "सुबह", "सवारे", "savaare", "savare", "morning", "सुबह को", "પોતે"
    )
    private val tomorrowWords = setOf(
        "આવતીકાલે", "આવતી કાલે", "उस कल", "कल", "tomorrow", "aavtikale", "aavi kaale", "kal"
    )

    /** @return minutes-from-now for "પચીસ મિનિટ પછી" / "in 2 hours" style. */
    fun parseDelayMinutes(utterance: String): Int? {
        val u = TextNorm.normalize(TextNorm.toLatinDigits(utterance))
        val num = NumberWords.parse(u) ?: return null
        val minuteish = listOf("મિનિટ", "मिनट", "minute", "minat", "mins", "મિનિટો")
        val hourish = listOf("કલાક", "घंटा", "घंटे", "घण्टा", "hour", "ugantho", "ghanta", "ughantho")
        return when {
            minuteish.any { u.contains(it) } -> num
            hourish.any { u.contains(it) } -> num * 60
            Regex("""\bmin\b""").containsMatchIn(u) -> num
            else -> null
        }
    }

    fun parseTimeOfDay(utterance: String, now: Calendar = Calendar.getInstance()): TimeGuess? {
        val u = TextNorm.toLatinDigits(TextNorm.normalize(utterance))
        val tokens = u.split(' ').filter { it.isNotBlank() }

        // Pattern "h:mm" or "h mm"
        val colon = Regex("""(\d{1,2}):(\d{2})""").find(u)
        var hour: Int? = null
        var minute = 0
        if (colon != null) {
            hour = colon.groupValues[1].toIntOrNull()
            minute = colon.groupValues[2].toIntOrNull() ?: 0
        } else {
            // "<number> વાગ્યે/बजे/o'clock"
            val idx = tokens.indexOfFirst { it.startsWith("વાગ્ય") || it.startsWith("वाज") || it == "o'clock" || it == "vaj" || it.startsWith("oclock") }
            if (idx > 0) {
                hour = NumberWords.parse(tokens[idx - 1])
            } else {
                hour = tokens.firstOrNull { it.toIntOrNull() != null && it.toInt() in 0..23 }?.toIntOrNull()
                if (hour != null) {
                    val hi = tokens.indexOf("$hour")
                    val next = tokens.getOrNull(hi + 1)
                    if (next != null && next.length == 2 && next.toIntOrNull() != null && next.toInt() in 0..59) minute = next.toInt()
                }
            }
        }

        if (hour == null || hour !in 0..23 || minute !in 0..59) return null

        val hasPm = tokens.any { it in pmWords }
        val hasAm = tokens.any { it in amWords }
        if (hasPm && hour < 12) hour += 12
        if (hasAm && hour == 12) hour = 0
        val resolved = hasPm || hasAm || hour > 12 || hour == 0

        val dayOffset = if (tokens.any { it in tomorrowWords }) 1 else 0
        return TimeGuess(hour, minute, resolved, dayOffset)
    }

    /** Resolve to the next future timestamp from [TimeGuess]. */
    fun toMillis(guess: TimeGuess, now: Calendar = Calendar.getInstance()): Long {
        val c = (now.clone() as Calendar)
        c.set(Calendar.HOUR_OF_DAY, guess.hour)
        c.set(Calendar.MINUTE, guess.minute)
        c.set(Calendar.SECOND, 0)
        c.set(Calendar.MILLISECOND, 0)
        if (guess.dayOffset > 0) c.add(Calendar.DAY_OF_YEAR, guess.dayOffset)
        // if a bare time already passed today → roll to next day
        if (guess.dayOffset == 0 && c.timeInMillis <= now.timeInMillis + 60_000) {
            c.add(Calendar.DAY_OF_YEAR, 1)
        }
        return c.timeInMillis
    }
}

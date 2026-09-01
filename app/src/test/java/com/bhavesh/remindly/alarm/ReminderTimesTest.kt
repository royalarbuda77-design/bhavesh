package com.bhavesh.remindly.alarm

import com.bhavesh.remindly.data.ReminderEntity
import com.bhavesh.remindly.data.RepeatType
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderTimesTest {
    private fun reminder(date: LocalDate, repeat: RepeatType = RepeatType.NEVER, zone: String = "UTC") = ReminderEntity(
        title = "Test", dateEpochDay = date.toEpochDay(), timeMinutes = 9 * 60,
        timezone = zone, repeatType = repeat.name
    )

    @Test fun pastOneTimeReminderIsNotScheduled() {
        val item = reminder(LocalDate.of(2024, 1, 1))
        assertEquals(null, ReminderTimes.nextTrigger(item, Instant.parse("2024-01-02T00:00:00Z")))
    }

    @Test fun dailyReminderFindsTheNextWallClockOccurrence() {
        val item = reminder(LocalDate.of(2024, 1, 1), RepeatType.DAILY)
        val result = Instant.ofEpochMilli(ReminderTimes.nextTrigger(item, Instant.parse("2024-01-02T10:00:00Z"))!!)
        assertEquals(Instant.parse("2024-01-03T09:00:00Z"), result)
    }

    @Test fun reminderUsesItsSavedTimezone() {
        val item = reminder(LocalDate.of(2024, 6, 1), zone = "America/New_York")
        val result = Instant.ofEpochMilli(ReminderTimes.nextTrigger(item, Instant.parse("2024-05-01T00:00:00Z"))!!)
        val wallClock = result.atZone(ZoneId.of("America/New_York"))
        assertEquals(9, wallClock.hour)
        assertEquals(1, wallClock.dayOfMonth)
    }

    @Test fun monthlyReminderDoesNotDisappearAfterTheOriginalDate() {
        val item = reminder(LocalDate.of(2024, 1, 31), RepeatType.MONTHLY)
        val result = Instant.ofEpochMilli(ReminderTimes.nextTrigger(item, Instant.parse("2024-03-01T00:00:00Z"))!!)
        assertTrue(result.atZone(ZoneId.of("UTC")).isAfter(ZonedDateTime.parse("2024-03-01T00:00:00Z")))
    }
}

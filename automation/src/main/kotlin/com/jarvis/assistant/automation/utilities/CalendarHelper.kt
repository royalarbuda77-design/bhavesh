package com.jarvis.assistant.automation.utilities

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.CalendarContract
import com.jarvis.assistant.automation.I18n
import com.jarvis.assistant.automation.perms.Capability
import com.jarvis.assistant.automation.perms.PermissionFinder
import com.jarvis.assistant.automation.system.ExecOutcome
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.util.PermissionRequests
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * Agenda lookup via READ_CALENDAR, event creation via the calendar "insert"
 * intent (user taps Save — the permission-free, Google-recommended flow).
 */
class CalendarHelper(private val context: Context) {

    data class Event(val title: String, val startMillis: Long, val location: String)

    private val df = SimpleDateFormat("EEE d MMM, h:mm a", Locale.getDefault())

    fun agenda(range: String): ExecOutcome {
        if (!PermissionFinder(context).status(Capability.CALENDAR).granted) {
            PermissionRequests.request(
                android.Manifest.permission.READ_CALENDAR,
                android.Manifest.permission.WRITE_CALENDAR
            )
            return ExecOutcome(false, I18n.noPermission("en", "Calendar"))
        }
        return runCatching {
            val now = Calendar.getInstance()
            val (from, to) = when (range.lowercase()) {
                "tomorrow" -> {
                    now.add(Calendar.DAY_OF_YEAR, 1)
                    now.set(Calendar.HOUR_OF_DAY, 0); now.set(Calendar.MINUTE, 0)
                    val f = now.timeInMillis
                    now.add(Calendar.DAY_OF_YEAR, 1)
                    f to now.timeInMillis
                }
                "week" -> {
                    val f = System.currentTimeMillis()
                    f to f + 7L * 24 * 3600_000
                }
                else -> {
                    now.set(Calendar.HOUR_OF_DAY, 0); now.set(Calendar.MINUTE, 0)
                    val f = now.timeInMillis
                    f to f + 24L * 3600_000
                }
            }
            val events = queryEvents(from, to)
            when {
                events.isEmpty() -> ExecOutcome(true, "Your calendar is clear for ${if (range == "tomorrow") "tomorrow" else range}.")
                else -> ExecOutcome(
                    true,
                    buildString {
                        append("You have ${events.size} ${if (events.size == 1) "event" else "events"}: ")
                        append(events.joinToString("; ") { "${it.title} at ${df.format(java.util.Date(it.startMillis))}" })
                    }
                )
            }
        }.getOrElse {
            JarvisLog.w("calendar query failed", it)
            ExecOutcome(false, "Could not read the calendar")
        }
    }

    private fun queryEvents(from: Long, to: Long): List<Event> {
        val out = ArrayList<Event>()
        context.contentResolver.query(
            CalendarContract.Events.CONTENT_URI,
            arrayOf(
                CalendarContract.Events.TITLE,
                CalendarContract.Events.DTSTART,
                CalendarContract.Events.EVENT_LOCATION
            ),
            "${CalendarContract.Events.DTSTART} >= ? AND ${CalendarContract.Events.DTSTART} <= ?",
            arrayOf(from.toString(), to.toString()),
            "${CalendarContract.Events.DTSTART} ASC"
        )?.use { c ->
            val iTitle = c.getColumnIndexOrThrow(CalendarContract.Events.TITLE)
            val iStart = c.getColumnIndexOrThrow(CalendarContract.Events.DTSTART)
            val iLoc = c.getColumnIndexOrThrow(CalendarContract.Events.EVENT_LOCATION)
            while (c.moveToNext() && out.size < 8) {
                out += Event(
                    title = c.getString(iTitle) ?: "(untitled)",
                    startMillis = c.getLong(iStart),
                    location = c.getString(iLoc) ?: ""
                )
            }
        }
        return out
    }

    /** Opens the calendar's create-screen pre-filled (no permission needed). */
    fun add(title: String, startMillis: Long, minutes: Int = 60): ExecOutcome = runCatching {
        val intent = Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.Events.TITLE, title)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMillis)
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, startMillis + minutes * 60_000L)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        ExecOutcome(true, "Calendar draft ready for '$title' — tap Save to keep it.")
    }.getOrElse {
        JarvisLog.w("calendar insert intent failed", it)
        ExecOutcome(false, "Calendar app didn't accept the draft — try creating it manually.")
    }

}

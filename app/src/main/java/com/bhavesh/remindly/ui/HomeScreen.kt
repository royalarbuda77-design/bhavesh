package com.bhavesh.remindly.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowForward
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Sparkles
import androidx.compose.material.icons.rounded.WbSunny
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bhavesh.remindly.data.ReminderEntity
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun HomeScreen(
    reminders: List<ReminderEntity>,
    now: Instant,
    onAdd: () -> Unit,
    onCalendar: () -> Unit,
    onSearch: () -> Unit,
    onSettings: () -> Unit,
    onUpcoming: () -> Unit,
    onCompleted: () -> Unit,
    onOpen: (Long) -> Unit,
    onComplete: (ReminderEntity) -> Unit
) {
    val today = LocalDate.now()
    val active = reminders.filter { !it.completed }
    val next = active.filter { it.effectiveInstant().isAfter(now) }.minByOrNull { it.effectiveInstant() }
    val todayItems = active.filter { it.effectiveDate() == today }.sortedBy { it.effectiveInstant() }
    val upcoming = active.filter { it.effectiveDate().isAfter(today) }.sortedBy { it.effectiveInstant() }.take(5)
    val greeting = when (java.time.LocalTime.now().hour) { in 5..11 -> "Good morning"; in 12..17 -> "Good afternoon"; else -> "Good evening" }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 112.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(greeting, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(4.dp))
                        Text("${today.format(DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.getDefault()))}  •  ${now.atZone(java.time.ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault()))}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = onSearch) { Icon(Icons.Rounded.Search, "Search reminders") }
                    IconButton(onClick = onSettings) { Icon(Icons.Rounded.Settings, "Settings") }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
            item {
                PremiumCard(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.primary) {
                    Column(Modifier.padding(22.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onPrimary)
                                Spacer(Modifier.size(8.dp))
                                Text("WHAT'S COMING UP?", style = MaterialTheme.typography.labelMedium, letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimary)
                            }
                            Icon(Icons.Rounded.CalendarMonth, "Calendar", tint = MaterialTheme.colorScheme.onPrimary)
                        }
                        Spacer(Modifier.height(22.dp))
                        if (next == null) {
                            Text("Your schedule is clear", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimary)
                            Spacer(Modifier.height(6.dp))
                            Text("A quiet moment. Add something you want to remember.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimary.copy(alpha = .72f))
                        } else {
                            Text("NEXT REMINDER", style = MaterialTheme.typography.labelSmall, letterSpacing = 1.4.sp, color = MaterialTheme.colorScheme.onPrimary.copy(alpha = .72f), fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(7.dp))
                            Text(next.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.height(5.dp))
                            Text("${relativeDate(next.effectiveDate(), today)}  •  ${next.displayTime()}", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onPrimary.copy(alpha = .85f))
                            Spacer(Modifier.height(18.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(countdown(next.effectiveInstant(), now), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimary)
                                Spacer(Modifier.weight(1f))
                                TextButton(onClick = { onOpen(next.id) }) { Text("View details", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold); Icon(Icons.Rounded.ArrowForward, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onPrimary) }
                            }
                        }
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 22.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    QuickDateChip("Today", onClick = { onCalendar() }, icon = Icons.Rounded.WbSunny)
                    QuickDateChip("Tomorrow", onClick = { onAdd() })
                    QuickDateChip("Next week", onClick = { onAdd() })
                    QuickDateChip("Completed", onClick = onCompleted)
                }
            }
            item { SectionHeader("Today", if (todayItems.isNotEmpty()) "${todayItems.size} reminders" else null) }
            if (todayItems.isEmpty()) item { EmptyState(Icons.Rounded.EventAvailable, "No reminders today", "Enjoy the space, or add something important.") }
            else items(todayItems, key = { it.id }) { reminder -> ReminderRow(reminder, now, { onOpen(reminder.id) }, { onComplete(reminder) }) }
            item { SectionHeader("Upcoming", if (upcoming.isNotEmpty()) "See all" else null, onUpcoming) }
            if (upcoming.isEmpty()) item { EmptyState(Icons.Rounded.CalendarMonth, "No upcoming reminders", "Your future is wide open.") }
            else items(upcoming, key = { it.id }) { reminder ->
                Column { Text(relativeDate(reminder.effectiveDate(), today), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp)); ReminderRow(reminder, now, { onOpen(reminder.id) }, { onComplete(reminder) }) }
            }
        }
        FloatingActionButton(onClick = onAdd, modifier = Modifier.align(Alignment.BottomEnd).padding(end = 20.dp, bottom = 22.dp), containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary) {
            Icon(Icons.Rounded.Add, "Add reminder", Modifier.size(28.dp))
        }
    }
}

@Composable
private fun QuickDateChip(label: String, onClick: () -> Unit, icon: androidx.compose.ui.graphics.vector.ImageVector? = null) {
    androidx.compose.material3.Surface(onClick = onClick, shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .72f)) {
        Row(Modifier.padding(horizontal = 13.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) { Icon(icon, null, Modifier.size(15.dp), tint = MaterialTheme.colorScheme.primary); Spacer(Modifier.size(6.dp)) }
            Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        }
    }
}

fun relativeDate(date: LocalDate, today: LocalDate): String = when {
    date == today -> "Today"
    date == today.plusDays(1) -> "Tomorrow"
    date == today.minusDays(1) -> "Yesterday"
    else -> date.format(DateTimeFormatter.ofPattern("EEE, d MMM", Locale.getDefault()))
}

fun countdown(target: Instant, now: Instant): String {
    val seconds = Duration.between(now, target).seconds.coerceAtLeast(0)
    val days = seconds / 86_400
    val hours = (seconds % 86_400) / 3_600
    val minutes = (seconds % 3_600) / 60
    return when {
        days > 0 -> "${days}d ${hours}h away"
        hours > 0 -> "${hours}h ${minutes}m away"
        else -> "${minutes}m away"
    }
}

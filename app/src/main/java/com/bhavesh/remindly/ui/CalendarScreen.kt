package com.bhavesh.remindly.ui

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ArrowForward
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Today
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bhavesh.remindly.data.ReminderEntity
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun CalendarScreen(reminders: List<ReminderEntity>, firstDay: String, onBack: (() -> Unit)? = null, onAdd: (LocalDate) -> Unit, onOpen: (Long) -> Unit) {
    val today = LocalDate.now()
    var selected by remember { mutableStateOf(today) }
    var month by remember { mutableStateOf(YearMonth.from(today)) }
    var showYearDialog by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val first = if (firstDay == "Sunday") DayOfWeek.SUNDAY else DayOfWeek.MONDAY
    val itemsOnDay = reminders.filter { it.localDate() == selected }.sortedBy { it.timeMinutes }
    val dayNames = (0..6).map { first.plus(it.toLong()).getDisplayName(java.time.format.TextStyle.SHORT, Locale.getDefault()) }
    val cells = remember(month, first) {
        val offset = (month.atDay(1).dayOfWeek.value - first.value + 7) % 7
        List(offset) { null } + (1..month.lengthOfMonth()).map { it }
    }

    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, "Back") }
            Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).clickable { showYearDialog = true }.padding(horizontal = 8.dp, vertical = 5.dp)) {
                Text(month.format(DateTimeFormatter.ofPattern("MMMM", Locale.getDefault())), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(month.year.toString(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            }
            TextButton(onClick = { selected = today; month = YearMonth.from(today) }) { Icon(Icons.Rounded.Today, null, Modifier.size(17.dp)); Spacer(Modifier.size(5.dp)); Text("Today") }
            TextButton(onClick = { DatePickerDialog(context, { _, y, m, d -> selected = LocalDate.of(y, m + 1, d); month = YearMonth.of(y, m + 1) }, selected.year, selected.monthValue - 1, selected.dayOfMonth).show() }) { Text("Go to date") }
            IconButton(onClick = { month = month.minusMonths(1) }) { Icon(Icons.Rounded.ArrowBack, "Previous month") }
            IconButton(onClick = { month = month.plusMonths(1) }) { Icon(Icons.Rounded.ArrowForward, "Next month") }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
            dayNames.forEach { Text(it.take(2), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
        }
        LazyVerticalGrid(columns = GridCells.Fixed(7), modifier = Modifier.fillMaxWidth().height(310.dp), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            items(cells) { day ->
                if (day == null) Spacer(Modifier.size(42.dp)) else {
                    val date = month.atDay(day)
                    val isSelected = selected == date
                    val isToday = date == today
                    val count = reminders.count { it.localDate() == date && !it.completed }
                    Box(Modifier.size(42.dp).clip(CircleShape).background(if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent).clickable { selected = date }, contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(day.toString(), style = MaterialTheme.typography.bodyMedium, fontWeight = if (isToday || isSelected) FontWeight.Bold else FontWeight.Normal, color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
                            Row(Modifier.height(5.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) { repeat(count.coerceAtMost(3)) { Box(Modifier.size(3.dp).clip(CircleShape).background(if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary)) } }
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(relativeDate(selected, today), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(selected.format(DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", Locale.getDefault())), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick = { onAdd(selected) }) { Text("+ Add reminder", fontWeight = FontWeight.Bold) }
        }
        androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .45f))
        if (itemsOnDay.isEmpty()) EmptyState(Icons.Rounded.CalendarMonth, "Nothing planned", "Add a reminder for this date.", Modifier.padding(horizontal = 20.dp))
        else LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, bottom = 24.dp)) { items(itemsOnDay, key = { it.id }) { reminder -> ReminderRow(reminder, onClick = { onOpen(reminder.id) }, onComplete = {}) } }
    }
    if (showYearDialog) {
        YearPickerDialog(year = month.year, onDismiss = { showYearDialog = false }, onSelect = { month = YearMonth.of(it, month.month); showYearDialog = false })
    }
    // Platform DatePicker gives a familiar, accessible day/month/year jump and supports dates far outside the current month.
    // It is intentionally opened from the year title with a long-press-friendly surface in the full screen version.
}

@Composable
private fun YearPickerDialog(year: Int, onDismiss: () -> Unit, onSelect: (Int) -> Unit) {
    var value by remember { mutableStateOf(year.toString()) }
    androidx.compose.material3.AlertDialog(onDismissRequest = onDismiss, title = { Text("Jump to year") }, text = {
        androidx.compose.material3.OutlinedTextField(value, { value = it.filter(Char::isDigit).take(4) }, label = { Text("Year") }, singleLine = true)
    }, confirmButton = { TextButton(onClick = { value.toIntOrNull()?.let(onSelect) }) { Text("Go") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

package com.bhavesh.remindly.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bhavesh.remindly.data.AlertType
import com.bhavesh.remindly.data.ReminderEntity
import com.bhavesh.remindly.data.RepeatType
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val categories = listOf("Personal", "Study", "Meeting", "Task", "Birthday", "Important")
private val colorOptions = listOf(0xFFC9F65BL, 0xFFA9B4FFFF, 0xFFFFB86BFF, 0xFFFF8C9EFF, 0xFF7DE2D1FF)
private val leadOptions = listOf(0, 5, 10, 15, 30, 60, 1440)

@Composable
fun AddReminderScreen(initial: ReminderEntity?, preselectedDate: LocalDate, onBack: () -> Unit, onSave: (ReminderDraft) -> Unit) {
    var draft by remember(initial?.id, preselectedDate) { mutableStateOf(initial?.toDraft() ?: ReminderDraft(date = preselectedDate)) }
    var titleError by remember { mutableStateOf(false) }
    var showMoreAlerts by remember { mutableStateOf(false) }
    val context = LocalContext.current

    Column(Modifier.fillMaxWidth()) {
        TopBackBar(if (initial == null) "New reminder" else "Edit reminder", onBack, action = {
            TextButton(onClick = {
                titleError = draft.title.isBlank()
                if (!titleError) onSave(draft)
            }) { Text("Save", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary) }
        })
        androidx.compose.foundation.lazy.LazyColumn(contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            item {
                Spacer(Modifier.height(4.dp))
                OutlinedTextField(value = draft.title, onValueChange = { draft = draft.copy(title = it); titleError = false }, modifier = Modifier.fillMaxWidth(), placeholder = { Text("Enter reminder title") }, label = { Text("TITLE") }, singleLine = true, isError = titleError, supportingText = if (titleError) ({ Text("Give your reminder a title") }) else null, shape = RoundedCornerShape(17.dp), textStyle = MaterialTheme.typography.titleMedium)
            }
            item { LabeledField("Description", draft.description, { draft = draft.copy(description = it) }, "Optional note", singleLine = false) }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    DateTimeCard("DATE", draft.date.format(DateTimeFormatter.ofPattern("EEE, d MMM yyyy", Locale.getDefault())), Icons.Rounded.CalendarMonth, Modifier.weight(1.3f)) {
                        DatePickerDialog(context, { _, y, m, d -> draft = draft.copy(date = LocalDate.of(y, m + 1, d)) }, draft.date.year, draft.date.monthValue - 1, draft.date.dayOfMonth).show()
                    }
                    DateTimeCard("TIME", draft.time.format(DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault())), Icons.Rounded.Schedule, Modifier.weight(1f)) {
                        TimePickerDialog(context, { _, hour, minute -> draft = draft.copy(time = LocalTime.of(hour, minute)) }, draft.time.hour, draft.time.minute, false).show()
                    }
                }
            }
            item {
                Text("CATEGORY", style = MaterialTheme.typography.labelSmall, letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) { categories.forEach { Chip(it, draft.category == it, { draft = draft.copy(category = it) }) } }
            }
            item {
                Text("COLOR", style = MaterialTheme.typography.labelSmall, letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { colorOptions.forEach { color ->
                    val chosen = draft.color == color
                    androidx.compose.foundation.layout.Box(Modifier.size(38.dp).clip(androidx.compose.foundation.shape.CircleShape).background(Color(color)).clickable { draft = draft.copy(color = color) }, contentAlignment = Alignment.Center) { if (chosen) Icon(Icons.Rounded.Check, "Selected", tint = Color(0xFF161619)) }
                } }
            }
            item {
                Text("REPEAT", style = MaterialTheme.typography.labelSmall, letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) { RepeatType.entries.forEach { type -> Chip(type.label, draft.repeat == type, { draft = draft.copy(repeat = type) }, if (type == RepeatType.NEVER) null else Icons.Rounded.Replay) } }
            }
            item {
                Text("ALERT", style = MaterialTheme.typography.labelSmall, letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { AlertType.entries.forEach { type -> Chip(type.label, draft.alert == type, { draft = draft.copy(alert = type) }, when (type) { AlertType.ALARM -> Icons.Rounded.Alarm; AlertType.SILENT -> Icons.Rounded.NotificationsNone; else -> null }) } }
            }
            item {
                Text("REMIND ME", style = MaterialTheme.typography.labelSmall, letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    leadOptions.forEach { lead -> Chip(leadLabel(lead), draft.leadMinutes.contains(lead), { draft = draft.copy(leadMinutes = if (draft.leadMinutes.contains(lead) && draft.leadMinutes.size > 1) draft.leadMinutes - lead else draft.leadMinutes + lead) }) }
                }
                Text("Select more than one for layered alerts.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 7.dp))
            }
            item {
                SettingRow(Icons.Rounded.NotificationsNone, "Vibration", "Use haptic feedback with this reminder", trailing = { Switch(checked = draft.vibration, onCheckedChange = { draft = draft.copy(vibration = it) }) })
            }
            item {
                Text("SNOOZE", style = MaterialTheme.typography.labelSmall, letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf(5, 10, 15, 30, 60).forEach { minutes -> Chip("${minutes}m", draft.snoozeMinutes == minutes, { draft = draft.copy(snoozeMinutes = minutes) }) } }
            }
            item {
                PrimaryButton(if (initial == null) "Set reminder" else "Save changes", { titleError = draft.title.isBlank(); if (!titleError) onSave(draft) }, Modifier.fillMaxWidth(), Icons.Rounded.Check)
            }
        }
    }
    if (showMoreAlerts) MoreAlertsDialog(onDismiss = { showMoreAlerts = false })
}

@Composable
private fun DateTimeCard(label: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier, onClick: () -> Unit) {
    androidx.compose.material3.Surface(onClick = onClick, modifier = modifier, shape = RoundedCornerShape(17.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .65f)) {
        Column(Modifier.padding(15.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { Icon(icon, null, Modifier.size(17.dp), tint = MaterialTheme.colorScheme.primary); Spacer(Modifier.size(7.dp)); Text(label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, letterSpacing = 1.sp) }
            Spacer(Modifier.height(10.dp)); Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
    }
}

private fun leadLabel(minutes: Int) = when (minutes) { 0 -> "At time"; 60 -> "1 hour"; 1440 -> "1 day"; else -> "$minutes min" }

@Composable
private fun MoreAlertsDialog(onDismiss: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Layered alerts") }, text = { Text("Select more than one lead time above to receive a gentle heads-up and a final alert at the exact event time.", textAlign = TextAlign.Start) }, confirmButton = { TextButton(onClick = onDismiss) { Text("Got it") } })
}

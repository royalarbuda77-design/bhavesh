package com.bhavesh.remindly.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.bhavesh.remindly.data.AlertType
import com.bhavesh.remindly.data.ReminderEntity
import com.bhavesh.remindly.data.RepeatType

@Composable
fun ReminderDetailScreen(reminder: ReminderEntity, onBack: () -> Unit, onEdit: () -> Unit, onDuplicate: () -> Unit, onComplete: () -> Unit, onDelete: () -> Unit) {
    var confirmDelete by remember { mutableStateOf(false) }
    val accent = Color(reminder.color)
    Column(Modifier.fillMaxWidth()) {
        TopBackBar("Reminder details", onBack, action = { androidx.compose.material3.IconButton(onClick = onEdit) { Icon(Icons.Rounded.Edit, "Edit reminder") } })
        LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            item {
                PremiumCard(Modifier.fillMaxWidth(), color = accent.copy(alpha = .18f)) {
                    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        CircleIcon(reminderIcon(reminder.icon), tint = accent, background = accent.copy(alpha = .22f), size = 72)
                        Spacer(Modifier.height(18.dp))
                        Text(reminder.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                        if (reminder.description.isNotBlank()) { Spacer(Modifier.height(8.dp)); Text(reminder.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center) }
                        Spacer(Modifier.height(18.dp))
                        Text(reminder.category, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
            item {
                PremiumCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                        DetailLine(Icons.Rounded.CalendarMonth, "Date", reminder.displayDate())
                        DetailLine(Icons.Rounded.Schedule, "Time", reminder.displayTime())
                        DetailLine(Icons.Rounded.Replay, "Repeat", RepeatType.from(reminder.repeatType).label)
                        DetailLine(Icons.Rounded.NotificationsNone, "Alert", AlertType.from(reminder.alertType).label)
                        DetailLine(Icons.Rounded.Alarm, "Remind me", leadLabelSummary(reminder.leadMinutes))
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = onDuplicate, modifier = Modifier.weight(1f).height(50.dp), shape = androidx.compose.foundation.shape.RoundedCornerShape(15.dp)) { Icon(Icons.Rounded.ContentCopy, null, Modifier.size(18.dp)); Spacer(Modifier.size(7.dp)); Text("Duplicate") }
                    if (!reminder.completed) PrimaryButton("Complete", onComplete, Modifier.weight(1f), Icons.Rounded.Check)
                }
            }
            item { TextButton(onClick = { confirmDelete = true }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Rounded.DeleteOutline, null, tint = MaterialTheme.colorScheme.error); Spacer(Modifier.size(7.dp)); Text("Delete reminder", color = MaterialTheme.colorScheme.error) } }
        }
    }
    if (confirmDelete) AlertDialog(onDismissRequest = { confirmDelete = false }, title = { Text("Delete reminder?") }, text = { Text("This reminder will be permanently removed and its scheduled alert will be cancelled.") }, confirmButton = { TextButton(onClick = { confirmDelete = false; onDelete() }) { Text("Delete", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold) } }, dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Keep it") } })
}

@Composable
private fun DetailLine(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(19.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.size(14.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

private fun leadLabelSummary(raw: String): String = raw.split(",").mapNotNull { it.toIntOrNull() }.sorted().joinToString(" + ") { when (it) { 0 -> "At time"; 60 -> "1 hour before"; 1440 -> "1 day before"; else -> "$it min before" } }

package com.bhavesh.remindly.ui

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.EventAvailable
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bhavesh.remindly.data.ReminderEntity
import java.time.Instant
import java.time.LocalDate

@Composable
fun UpcomingScreen(reminders: List<ReminderEntity>, onBack: () -> Unit, onOpen: (Long) -> Unit, onComplete: (ReminderEntity) -> Unit) {
    val today = LocalDate.now()
    val data = reminders.filter { !it.completed && it.effectiveDate().isAfter(today) }.sortedBy { it.effectiveInstant() }
    Column(Modifier.fillMaxWidth()) {
        TopBackBar("Upcoming", onBack)
        LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, bottom = 28.dp)) {
            item { Text("Everything ahead, in one calm view.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.height(18.dp)) }
            if (data.isEmpty()) item { EmptyState(Icons.Rounded.EventAvailable, "No upcoming reminders", "You have room for what's next.") }
            else itemsIndexed(data, key = { _, item -> item.id }) { index, reminder ->
                if (index == 0 || data[index - 1].effectiveDate() != reminder.effectiveDate()) Text(relativeDate(reminder.localDate(), today), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 15.dp, bottom = 4.dp))
                ReminderRow(reminder, onClick = { onOpen(reminder.id) }, onComplete = { onComplete(reminder) })
            }
        }
    }
}

@Composable
fun CompletedScreen(reminders: List<ReminderEntity>, now: Instant, onBack: () -> Unit, onOpen: (Long) -> Unit) {
    var filter by remember { mutableStateOf("Completed") }
    val data = when (filter) {
        "Missed" -> reminders.filter { !it.completed && !it.enabled && it.dateTime().toInstant().isBefore(now) }
        "Recurring" -> reminders.filter { it.repeatType != "NEVER" && !it.completed }
        "All" -> reminders
        else -> reminders.filter { it.completed }.sortedByDescending { it.updatedAt }
    }.sortedByDescending { it.dateTime() }
    Column(Modifier.fillMaxWidth()) {
        TopBackBar("Your library", onBack)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Completed", "Missed", "Recurring", "All").forEach { Chip(it, filter == it, { filter = it }) }
        }
        LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, bottom = 28.dp)) {
            if (data.isEmpty()) item { EmptyState(if (filter == "Completed") Icons.Rounded.CheckCircle else Icons.Rounded.EventAvailable, if (filter == "Completed") "No completed reminders yet" else "Nothing here", "Your reminder history will appear here.") }
            else items(data, key = { it.id }) { reminder -> ReminderRow(reminder, onClick = { onOpen(reminder.id) }, onComplete = {}) }
        }
    }
}

@Composable
fun SearchScreen(reminders: List<ReminderEntity>, onBack: () -> Unit, onOpen: (Long) -> Unit) {
    var query by remember { mutableStateOf("") }
    var category by remember { mutableStateOf<String?>(null) }
    val results = reminders.filter { item ->
        val text = "${item.title} ${item.description} ${item.category}".lowercase()
        (query.isBlank() || text.contains(query.lowercase())) && (category == null || item.category == category)
    }
    val categories = reminders.map { it.category }.distinct().take(6)
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, "Back") }
            OutlinedTextField(query, { query = it }, modifier = Modifier.weight(1f), placeholder = { Text("Search reminders") }, leadingIcon = { Icon(Icons.Rounded.Search, null) }, singleLine = true, shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp))
            IconButton(onClick = {}) { Icon(Icons.Rounded.Tune, "Filter") }
        }
        if (categories.isNotEmpty()) Row(Modifier.padding(horizontal = 20.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) { categories.forEach { Chip(it, category == it, { category = if (category == it) null else it }) } }
        LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, bottom = 28.dp)) {
            item { Text("${results.size} result${if (results.size == 1) "" else "s"}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 14.dp)) }
            if (results.isEmpty()) item { EmptyState(Icons.Rounded.Search, "No reminders found", "Try another title, note, or category.") }
            else items(results, key = { it.id }) { reminder -> ReminderRow(reminder, onClick = { onOpen(reminder.id) }, onComplete = {}) }
        }
    }
}

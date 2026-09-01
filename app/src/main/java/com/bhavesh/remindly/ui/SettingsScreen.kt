@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.BatteryChargingFull
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.FileDownload
import androidx.compose.material.icons.rounded.FileUpload
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Switch
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun SettingsScreen(
    settings: SettingsState,
    exactAlarmsAllowed: Boolean,
    notificationsAllowed: Boolean,
    onBack: () -> Unit,
    onTheme: (ThemeChoice) -> Unit,
    onFirstDay: (String) -> Unit,
    onVibration: (Boolean) -> Unit,
    onExactAlarm: () -> Unit,
    onNotificationPermission: () -> Unit,
    onBatterySettings: () -> Unit,
    onExport: () -> Unit,
    onImport: () -> Unit,
    onClearCompleted: () -> Unit
) {
    var showClearDialog by remember { mutableStateOf(false) }
    var showExactExplanation by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        TopBackBar("Settings", onBack)
        androidx.compose.foundation.lazy.LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, bottom = 34.dp)) {
            item { SettingsSectionLabel("General") }
            item { SettingRow(Icons.Rounded.Schedule, "Default alert", "Notification") }
            item { SettingRow(Icons.Rounded.Alarm, "Default snooze", "10 minutes") }
            item {
                SettingRow(Icons.Rounded.CalendarMonth, "First day of week", settings.firstDay, trailing = {
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(5.dp)) { listOf("Monday", "Sunday").forEach { Chip(it, settings.firstDay == it, { onFirstDay(it) }) } }
                })
            }
            item { SettingsSectionLabel("Notifications") }
            item {
                PermissionCard(Icons.Rounded.NotificationsNone, "Notifications", if (notificationsAllowed) "Alerts are enabled" else "Permission needed", notificationsAllowed, onNotificationPermission)
            }
            item { SettingRow(Icons.Rounded.NotificationsNone, "Vibration", "Use haptics on reminder alerts", trailing = { Switch(settings.vibration, onVibration) }) }
            item { SettingsSectionLabel("Alarm reliability") }
            item {
                PermissionCard(Icons.Rounded.Alarm, "Precise reminders", if (exactAlarmsAllowed) "Exact alarm access is enabled" else "Allow access for exact-time alerts", exactAlarmsAllowed, { if (exactAlarmsAllowed) onExactAlarm() else showExactExplanation = true })
            }
            item { SettingRow(Icons.Rounded.BatteryChargingFull, "Battery optimization", "Keep reminders reliable in power-saving mode", onClick = onBatterySettings) }
            item { SettingsSectionLabel("Appearance") }
            item {
                Text("Theme", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(10.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) { ThemeChoice.entries.forEach { Chip(it.label, settings.theme == it, { onTheme(it) }) } }
            }
            item { SettingsSectionLabel("Data") }
            item { SettingRow(Icons.Rounded.DeleteSweep, "Clear completed reminders", "Remove them from your history", onClick = { showClearDialog = true }) }
            item { SettingRow(Icons.Rounded.FileUpload, "Export reminders", "Save an offline JSON backup", onClick = onExport) }
            item { SettingRow(Icons.Rounded.FileDownload, "Import reminders", "Restore from a Remindly backup", onClick = onImport) }
            item { SettingRow(Icons.Rounded.Shield, "Your data stays private", "Remindly works offline. Your reminders never leave this device.") }
            item { SettingsSectionLabel("About") }
            item { SettingRow(Icons.Rounded.Info, "Remindly", "Version 1.0  •  Built for calm, focused days") }
        }
    }
    if (showExactExplanation) AlertDialog(onDismissRequest = { showExactExplanation = false }, title = { Text("Allow precise reminders") }, text = { Text("Remindly uses Android's exact alarm access to alert you at the exact date and time you choose, even when the app is closed. Your reminders stay on this device.") }, confirmButton = { TextButton(onClick = { showExactExplanation = false; onExactAlarm() }) { Text("Enable", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold) } }, dismissButton = { TextButton(onClick = { showExactExplanation = false }) { Text("Not now") } })
    if (showClearDialog) AlertDialog(onDismissRequest = { showClearDialog = false }, title = { Text("Clear completed reminders?") }, text = { Text("Completed reminders will be permanently removed from your history.") }, confirmButton = { TextButton(onClick = { showClearDialog = false; onClearCompleted() }) { Text("Clear", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold) } }, dismissButton = { TextButton(onClick = { showClearDialog = false }) { Text("Cancel") } })
}

@Composable
private fun SettingsSectionLabel(label: String) {
    Text(label.uppercase(), style = MaterialTheme.typography.labelMedium, letterSpacing = 1.5.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 26.dp, bottom = 8.dp))
}

@Composable
private fun PermissionCard(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, enabled: Boolean, onClick: () -> Unit) {
    androidx.compose.material3.Surface(onClick = onClick, shape = androidx.compose.foundation.shape.RoundedCornerShape(18.dp), color = if (enabled) MaterialTheme.colorScheme.primary.copy(alpha = .11f) else MaterialTheme.colorScheme.error.copy(alpha = .08f), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            CircleIcon(icon, tint = if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error, background = if (enabled) MaterialTheme.colorScheme.primary.copy(alpha = .13f) else MaterialTheme.colorScheme.error.copy(alpha = .12f), size = 42)
            Spacer(Modifier.size(13.dp))
            Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.Bold); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (!enabled) Text("Enable", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        }
    }
}

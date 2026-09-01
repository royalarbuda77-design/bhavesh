package com.bhavesh.remindly.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.EventAvailable
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Snooze
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material.icons.rounded.Today
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bhavesh.remindly.data.ReminderEntity
import java.time.Duration
import java.time.Instant

val Accent = Color(0xFFC9F65B)
val AccentMuted = Color(0xFFE5F7AE)
val Purple = Color(0xFFA9B4FF)

@Composable
fun ScreenColumn(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth().padding(horizontal = 20.dp), content = content)
}

@Composable
fun PremiumCard(modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.surface, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(26.dp),
        colors = CardDefaults.cardColors(containerColor = color),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        content = content
    )
}

@Composable
fun SectionHeader(title: String, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(top = 26.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title.uppercase(), style = MaterialTheme.typography.labelMedium, letterSpacing = 1.4.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.weight(1f))
        if (action != null && onAction != null) TextButton(onClick = onAction) {
            Text(action, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
            Icon(Icons.AutoMirrored.Rounded.ArrowForward, null, Modifier.size(16.dp))
        }
    }
}

@Composable
fun CircleIcon(icon: ImageVector, tint: Color = MaterialTheme.colorScheme.onSurface, background: Color = MaterialTheme.colorScheme.surfaceVariant, size: Int = 44, description: String? = null) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(background).semantics { if (description != null) contentDescription = description }, contentAlignment = Alignment.Center) {
        Icon(icon, description, Modifier.size((size / 2).dp), tint = tint)
    }
}

@Composable
fun ReminderRow(
    reminder: ReminderEntity,
    now: Instant = Instant.now(),
    onClick: () -> Unit,
    onComplete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val doneAlpha by animateFloatAsState(if (reminder.completed) .56f else 1f, label = "completed")
    val color = Color(reminder.color)
    Row(
        modifier.fillMaxWidth().alpha(doneAlpha).clip(RoundedCornerShape(20.dp)).clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.width(54.dp), contentAlignment = Alignment.CenterStart) {
            Text(reminder.displayTime(), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        }
        Box(Modifier.width(3.dp).height(42.dp).clip(RoundedCornerShape(2.dp)).background(color))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(reminder.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(reminder.category, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (reminder.repeatType != "NEVER") {
                    Text("  •  ", color = MaterialTheme.colorScheme.outline)
                    Icon(Icons.Rounded.Replay, "Repeating", Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        IconButton(onClick = onComplete, modifier = Modifier.size(44.dp).semantics { contentDescription = if (reminder.completed) "Completed" else "Mark ${reminder.title} as complete" }) {
            Icon(if (reminder.completed) Icons.Rounded.CheckCircle else Icons.Rounded.Check, null, tint = if (reminder.completed) color else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, body: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(vertical = 34.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        CircleIcon(icon, tint = MaterialTheme.colorScheme.primary, background = MaterialTheme.colorScheme.primary.copy(alpha = .13f), size = 68)
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null) {
    Button(onClick = onClick, modifier = modifier.height(54.dp), shape = RoundedCornerShape(17.dp), colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary)) {
        if (icon != null) { Icon(icon, null, Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)) }
        Text(text, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun LabeledField(label: String, value: String, onValueChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, singleLine: Boolean = true) {
    Column(modifier) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        androidx.compose.material3.OutlinedTextField(value = value, onValueChange = onValueChange, modifier = Modifier.fillMaxWidth(), placeholder = { Text(placeholder) }, singleLine = singleLine, minLines = if (singleLine) 1 else 3, shape = RoundedCornerShape(16.dp))
    }
}

@Composable
fun SettingRow(icon: ImageVector, title: String, subtitle: String? = null, onClick: (() -> Unit)? = null, trailing: @Composable (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        CircleIcon(icon, tint = MaterialTheme.colorScheme.primary, background = MaterialTheme.colorScheme.primary.copy(alpha = .12f), size = 40)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        trailing?.invoke()
        if (onClick != null && trailing == null) Icon(Icons.Rounded.ChevronRight, "Open", tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit, leadingIcon: ImageVector? = null) {
    FilterChip(selected = selected, onClick = onClick, label = { Text(text, fontWeight = FontWeight.Medium) }, leadingIcon = leadingIcon?.let { { Icon(it, null, Modifier.size(16.dp)) } }, shape = RoundedCornerShape(12.dp), colors = FilterChipDefaults.filterChipColors(selectedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = .18f), selectedLabelColor = MaterialTheme.colorScheme.onSurface))
}

@Composable
fun TopBackBar(title: String, onBack: () -> Unit, action: (@Composable () -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, "Back") }
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        action?.invoke()
    }
}

@Composable
fun BottomNavBar(current: AppScreen, onNavigate: (AppScreen) -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = .98f), tonalElevation = 3.dp) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 9.dp), horizontalArrangement = Arrangement.SpaceAround) {
            listOf(AppScreen.HOME to (Icons.Rounded.Today to "Today"), AppScreen.CALENDAR to (Icons.Rounded.CalendarMonth to "Calendar"), AppScreen.UPCOMING to (Icons.Rounded.EventAvailable to "Upcoming"), AppScreen.SETTINGS to (Icons.Rounded.Settings to "Settings")).forEach { (screen, data) ->
                val selected = current == screen
                Column(Modifier.clip(RoundedCornerShape(16.dp)).clickable { onNavigate(screen) }.padding(horizontal = 12.dp, vertical = 5.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(data.first, data.second, Modifier.size(22.dp), tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(data.second, style = MaterialTheme.typography.labelSmall, color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
                }
            }
        }
    }
}

@Composable
fun AlarmExperience(reminder: ReminderEntity, onDone: () -> Unit, onSnooze: () -> Unit, onDismiss: () -> Unit) {
    val color = Color(reminder.color)
    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background).padding(28.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        CircleIcon(Icons.Rounded.Alarm, tint = color, background = color.copy(alpha = .16f), size = 88)
        Spacer(Modifier.height(28.dp))
        Text("REMINDER NOW", style = MaterialTheme.typography.labelMedium, letterSpacing = 2.sp, color = color, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(12.dp))
        Text(reminder.title, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        if (reminder.description.isNotBlank()) { Spacer(Modifier.height(12.dp)); Text(reminder.description, style = MaterialTheme.typography.bodyLarge, textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Spacer(Modifier.height(16.dp))
        Text("${reminder.displayDate()}  •  ${reminder.displayTime()}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(40.dp))
        PrimaryButton("DONE", onDone, Modifier.fillMaxWidth(), Icons.Rounded.Check)
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick = onSnooze, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(17.dp)) { Icon(Icons.Rounded.Snooze, null); Spacer(Modifier.width(8.dp)); Text("Snooze ${reminder.snoozeDuration} minutes", fontWeight = FontWeight.Bold) }
        Spacer(Modifier.height(10.dp))
        TextButton(onClick = onDismiss) { Text("Dismiss") }
    }
}

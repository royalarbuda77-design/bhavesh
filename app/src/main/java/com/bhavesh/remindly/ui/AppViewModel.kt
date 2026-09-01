package com.bhavesh.remindly.ui

import android.app.AlarmManager
import android.app.Application
import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.bhavesh.remindly.ReminderApp
import com.bhavesh.remindly.data.AlertType
import com.bhavesh.remindly.data.ReminderEntity
import com.bhavesh.remindly.data.ReminderRepository
import com.bhavesh.remindly.data.RepeatType
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.time.Duration.Companion.seconds
import org.json.JSONArray
import org.json.JSONObject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

private val Context.remindlyDataStore by preferencesDataStore("remindly_preferences")
private val THEME_KEY = stringPreferencesKey("theme")
private val FIRST_DAY_KEY = stringPreferencesKey("first_day")
private val VIBRATION_KEY = booleanPreferencesKey("vibration")

enum class ThemeChoice(val label: String) { SYSTEM("System default"), LIGHT("Light"), DARK("Dark") }

data class SettingsState(
    val theme: ThemeChoice = ThemeChoice.SYSTEM,
    val firstDay: String = "Monday",
    val vibration: Boolean = true
)

data class ReminderDraft(
    val title: String = "",
    val description: String = "",
    val date: LocalDate = LocalDate.now(),
    val time: LocalTime = LocalTime.now().plusHours(1).withSecond(0).withNano(0),
    val category: String = "Personal",
    val icon: String = "check",
    val color: Long = 0xFFC9F65BL,
    val repeat: RepeatType = RepeatType.NEVER,
    val alert: AlertType = AlertType.NOTIFICATION,
    val snoozeMinutes: Int = 10,
    val vibration: Boolean = true,
    val leadMinutes: Set<Int> = setOf(0)
)

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as ReminderApp
    private val repository: ReminderRepository = app.repository
    val reminders: StateFlow<List<ReminderEntity>> = repository.reminders.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList()
    )
    val settings: StateFlow<SettingsState> = application.remindlyDataStore.data.map { preferences ->
        SettingsState(
            theme = ThemeChoice.entries.firstOrNull { it.name == preferences[THEME_KEY] } ?: ThemeChoice.SYSTEM,
            firstDay = preferences[FIRST_DAY_KEY] ?: "Monday",
            vibration = preferences[VIBRATION_KEY] ?: true
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SettingsState())
    val now: StateFlow<java.time.Instant> = flow {
        while (true) { emit(java.time.Instant.now()); kotlinx.coroutines.delay(30.seconds) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), java.time.Instant.now())

    fun reminder(id: Long): Flow<ReminderEntity?> = repository.reminder(id)

    fun save(draft: ReminderDraft, existing: ReminderEntity? = null, onSaved: (Long) -> Unit = {}, onError: () -> Unit = {}) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val timestamp = System.currentTimeMillis()
                val entity = ReminderEntity(
                    id = existing?.id ?: 0,
                    title = draft.title.trim(),
                    description = draft.description.trim(),
                    dateEpochDay = draft.date.toEpochDay(),
                    timeMinutes = draft.time.hour * 60 + draft.time.minute,
                    timezone = existing?.timezone ?: ZoneId.systemDefault().id,
                    category = draft.category,
                    icon = draft.icon,
                    color = draft.color,
                    repeatType = draft.repeat.name,
                    snoozeDuration = draft.snoozeMinutes,
                    alertType = draft.alert.name,
                    sound = existing?.sound ?: "default",
                    vibration = draft.vibration,
                    leadMinutes = draft.leadMinutes.sorted().joinToString(","),
                    createdAt = existing?.createdAt ?: timestamp,
                    updatedAt = timestamp,
                    lastTriggeredAt = existing?.lastTriggeredAt,
                    nextTriggerAt = null,
                    enabled = existing?.completed != true,
                    completed = existing?.completed ?: false
                )
                val id = if (existing == null) repository.insert(entity) else { repository.update(entity); entity.id }
                val saved = repository.get(id)
                if (saved != null) app.scheduler.schedule(saved)
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) { onSaved(id) }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) { onError() }
            }
        }
    }

    fun delete(reminder: ReminderEntity, onDeleted: () -> Unit = {}) {
        viewModelScope.launch(Dispatchers.IO) {
            app.scheduler.cancel(reminder.id)
            repository.delete(reminder)
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) { onDeleted() }
        }
    }

    fun complete(reminder: ReminderEntity) {
        viewModelScope.launch(Dispatchers.IO) {
            app.scheduler.cancel(reminder.id)
            repository.update(reminder.copy(completed = true, enabled = false, nextTriggerAt = null, updatedAt = System.currentTimeMillis()))
            app.notifications.cancel(reminder.id)
        }
    }

    fun duplicate(reminder: ReminderEntity, onCreated: (Long) -> Unit = {}) {
        val copy = reminder.copy(id = 0, title = "${reminder.title} copy", completed = false, enabled = true, createdAt = System.currentTimeMillis(), updatedAt = System.currentTimeMillis(), nextTriggerAt = null)
        viewModelScope.launch(Dispatchers.IO) {
            val id = repository.insert(copy)
            repository.get(id)?.let { app.scheduler.schedule(it) }
            kotlinx.coroutines.withContext(Dispatchers.Main) { onCreated(id) }
        }
    }

    fun updateTheme(theme: ThemeChoice) = viewModelScope.launch { getApplication<Application>().remindlyDataStore.edit { it[THEME_KEY] = theme.name } }
    fun updateFirstDay(day: String) = viewModelScope.launch { getApplication<Application>().remindlyDataStore.edit { it[FIRST_DAY_KEY] = day } }
    fun updateVibration(value: Boolean) = viewModelScope.launch { getApplication<Application>().remindlyDataStore.edit { it[VIBRATION_KEY] = value } }
    fun clearCompleted() = viewModelScope.launch(Dispatchers.IO) { repository.deleteCompleted() }

    fun exactAlarmsAllowed(): Boolean {
        val manager = getApplication<Application>().getSystemService(AlarmManager::class.java)
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()
    }

    fun notificationsAllowed(): Boolean = Build.VERSION.SDK_INT < 33 ||
        androidx.core.app.NotificationManagerCompat.from(getApplication()).areNotificationsEnabled()

    fun rescheduleAll() = viewModelScope.launch(Dispatchers.IO) { app.scheduler.rescheduleAll() }

    fun exportTo(uri: Uri) {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                val root = JSONObject().put("format", "remindly-1").put("exportedAt", System.currentTimeMillis())
                val array = JSONArray()
                repository.getAll().forEach { item ->
                    array.put(JSONObject().apply {
                        put("title", item.title); put("description", item.description)
                        put("dateEpochDay", item.dateEpochDay); put("timeMinutes", item.timeMinutes)
                        put("timezone", item.timezone); put("category", item.category); put("icon", item.icon)
                        put("color", item.color); put("repeatType", item.repeatType); put("repeatInterval", item.repeatInterval)
                        put("enabled", item.enabled); put("completed", item.completed); put("snoozeDuration", item.snoozeDuration)
                        put("alertType", item.alertType); put("sound", item.sound); put("vibration", item.vibration)
                        put("leadMinutes", item.leadMinutes); put("createdAt", item.createdAt); put("updatedAt", item.updatedAt)
                    })
                }
                root.put("reminders", array)
                getApplication<Application>().contentResolver.openOutputStream(uri)?.use { output ->
                    output.writer(Charsets.UTF_8).use { it.write(root.toString(2)) }
                }
            }
        }
    }

    fun importFrom(uri: Uri, onComplete: (Int) -> Unit = {}) {
        viewModelScope.launch(Dispatchers.IO) {
            val imported = runCatching {
                val raw = getApplication<Application>().contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: return@runCatching 0
                val array = JSONObject(raw).optJSONArray("reminders") ?: JSONArray()
                var count = 0
                for (index in 0 until array.length()) {
                    val value = array.optJSONObject(index) ?: continue
                    val item = ReminderEntity(
                        title = value.optString("title").trim().ifBlank { "Untitled reminder" },
                        description = value.optString("description"), dateEpochDay = value.optLong("dateEpochDay"),
                        timeMinutes = value.optInt("timeMinutes").coerceIn(0, 1439), timezone = value.optString("timezone", ZoneId.systemDefault().id),
                        category = value.optString("category", "Personal"), icon = value.optString("icon", "check"), color = value.optLong("color", 0xFFC9F65BL),
                        repeatType = value.optString("repeatType", "NEVER"), repeatInterval = value.optInt("repeatInterval", 1).coerceAtLeast(1),
                        enabled = value.optBoolean("enabled", true), completed = value.optBoolean("completed", false), snoozeDuration = value.optInt("snoozeDuration", 10),
                        alertType = value.optString("alertType", "NOTIFICATION"), sound = value.optString("sound", "default"), vibration = value.optBoolean("vibration", true),
                        leadMinutes = value.optString("leadMinutes", "0"), createdAt = value.optLong("createdAt", System.currentTimeMillis()), updatedAt = System.currentTimeMillis()
                    )
                    val id = repository.insert(item)
                    repository.get(id)?.let { app.scheduler.schedule(it) }
                    count++
                }
                count
            }.getOrDefault(0)
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) { onComplete(imported) }
        }
    }
}

fun ReminderEntity.toDraft(): ReminderDraft = ReminderDraft(
    title = title,
    description = description,
    date = LocalDate.ofEpochDay(dateEpochDay),
    time = LocalTime.of(timeMinutes / 60, timeMinutes % 60),
    category = category,
    icon = icon,
    color = color,
    repeat = RepeatType.from(repeatType),
    alert = AlertType.from(alertType),
    snoozeMinutes = snoozeDuration,
    vibration = vibration,
    leadMinutes = leadMinutes.split(",").mapNotNull { it.trim().toIntOrNull() }.filter { it >= 0 }.toSet().ifEmpty { setOf(0) }
)

private val dateFormatter = DateTimeFormatter.ofPattern("EEE, d MMM", Locale.getDefault())
private val timeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault())
fun ReminderEntity.localDate() = LocalDate.ofEpochDay(dateEpochDay)
fun ReminderEntity.localTime() = LocalTime.of(timeMinutes / 60, timeMinutes % 60)
fun ReminderEntity.displayDate() = localDate().format(dateFormatter)
fun ReminderEntity.displayTime() = localTime().format(timeFormatter)
fun ReminderEntity.dateTime() = java.time.ZonedDateTime.of(localDate(), localTime(), runCatching { ZoneId.of(timezone) }.getOrDefault(ZoneId.systemDefault()))
fun ReminderEntity.effectiveInstant() = nextTriggerAt?.let { java.time.Instant.ofEpochMilli(it) } ?: dateTime().toInstant()
fun ReminderEntity.effectiveDate() = effectiveInstant().atZone(runCatching { ZoneId.of(timezone) }.getOrDefault(ZoneId.systemDefault())).toLocalDate()

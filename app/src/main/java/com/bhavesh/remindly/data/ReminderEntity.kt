package com.bhavesh.remindly.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A reminder stores a calendar date (epoch day) and wall-clock minutes separately.
 * This is deliberate: a date is not an instant. The zoneId is used only when the
 * alarm instant is calculated, so moving between time zones cannot corrupt history.
 */
@Entity(
    tableName = "reminders",
    indices = [
        Index(value = ["dateEpochDay", "timeMinutes"]),
        Index(value = ["nextTriggerAt"]),
        Index(value = ["completed"]),
        Index(value = ["enabled"])
    ]
)
data class ReminderEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val description: String = "",
    val dateEpochDay: Long,
    val timeMinutes: Int,
    val timezone: String,
    val category: String = "Personal",
    val icon: String = "check",
    val color: Long = 0xFFC9F65BL,
    val repeatType: String = RepeatType.NEVER.name,
    val repeatInterval: Int = 1,
    val enabled: Boolean = true,
    val completed: Boolean = false,
    val snoozeDuration: Int = 10,
    val alertType: String = AlertType.NOTIFICATION.name,
    val sound: String = "default",
    val vibration: Boolean = true,
    /** Comma-separated lead times in minutes; 0 means at the event time. */
    val leadMinutes: String = "0",
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val lastTriggeredAt: Long? = null,
    val nextTriggerAt: Long? = null
)

enum class RepeatType(val label: String) {
    NEVER("Never"), DAILY("Daily"), WEEKLY("Weekly"), MONTHLY("Monthly"), YEARLY("Yearly");

    companion object {
        fun from(value: String) = entries.firstOrNull { it.name == value } ?: NEVER
    }
}

enum class AlertType(val label: String) {
    NOTIFICATION("Notification"), ALARM("Alarm"), SOUND("Sound + notification"), VIBRATE("Vibrate + sound"), SILENT("Silent notification");

    companion object {
        fun from(value: String) = entries.firstOrNull { it.name == value } ?: NOTIFICATION
    }
}

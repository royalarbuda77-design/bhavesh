# Remindly

Remindly is an offline-first, premium smart reminder and calendar app for Android. It is built with Kotlin, Jetpack Compose, Room, DataStore, and Android's persistent alarm APIs.

## Product highlights

- Select any day in the custom month calendar, including dates far in the past or future.
- Save a wall-clock date, time, and IANA time zone separately so reminders remain safe across time-zone and DST changes.
- Layered alerts with multiple lead times (at event time, 5/10/15/30/60 minutes, or one day before).
- Exact-time AlarmManager delivery, Doze-aware fallback when precise alarm access is unavailable, heads-up notification channels, and a lock-screen alarm experience.
- Done and Snooze notification actions, recurring daily/weekly/monthly/yearly reminders, edit/duplicate/delete, search, filters, completed history, and clear empty states.
- Reboot, app-update, time-change, and time-zone receivers restore active future alarms from Room.
- Light, dark, and system themes; large touch targets, content descriptions, and local-only data.

## Build

Open the project in Android Studio Hedgehog or newer and let Gradle sync. The app targets Android 15 (API 35), supports Android 8.0 (API 26) and above, and uses Java 17 desugaring for `java.time` on older supported devices.

For a reliable production release, verify notification permission, exact alarm access, and battery policy on the device or OEM build. Android may coalesce the documented fallback alarm when the user declines precise alarm access; Remindly always surfaces the permission state in Settings rather than pretending an exact alarm was scheduled.

## Structure

- `data/` — Room entity, indexed DAO, database, and repository
- `alarm/` — AlarmManager scheduling, delivery, notification actions, full-screen alarm UI, and reboot recovery
- `ui/` — Compose screens, premium theme/components, stateful ViewModel, calendar, search, settings, and detail flows

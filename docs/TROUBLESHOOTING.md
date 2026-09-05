# Troubleshooting

## Build

| Symptom | Fix |
|---|---|
| “Gradle wrapper jar missing” / `./gradlew` fails | Android Studio opens it anyway (bundled Gradle). CLI: install Gradle 8.13+ then run `gradle wrapper --gradle-version 8.13` once. |
| `Unsupported class file major version` / AGP needs newer JDK | Studio 2024.2+ ships JDK 17 — set `Settings ▸ Build tools ▸ Gradle ▸ Gradle JDK = jbr-17+`. |
| Sync fails “AGP 8.13 requires Gradle 8.13” | Don't edit versions; let Studio upgrade, or set distributionUrl to 8.13. |
| Compose compiler errors on Kotlin downgrade | Kotlin 2.2.0 **must** pair with `org.jetbrains.kotlin.plugin.compose` (same version). No kapt Compose flags needed. |
| `SDK location not found` | `local.properties`: `sdk.dir=/path/to/Android/sdk` (Studio writes it automatically). |
| Release build “keystore not found” | signing config falls back to debug automatically; or follow SETUP_GUIDE §7. |

## Runtime

| Symptom | Cause → Fix |
|---|---|
| “Wake up Jarvis” never heard after some minutes | OEM battery killer → unrestricted battery + autostart (SETUP_GUIDE §6). Check Diagnostics screen: SERVICE chip must read RUNNING. |
| Listens but no transcript | device STT missing → install/update **Google app + speech services**, or set Settings→Voice input; check `STT engine: READY` in Diagnostics. |
| Gujarati recognized as gibberish English | download Gujarati offline language pack (Google voice data) or set STT language to `gu-IN`. |
| Jarvis answers itself once then stops | echo guard too short on your device → enable “Barge-in” OFF as workaround, or raise the multiplier in `AudioGate.echoGuardMs` (one line). |
| Torch command says no camera flash | device has no LED — nothing to fix. |
| Wi-Fi panel opens instead of silent ON | Android 10+ platform rule (see LIMITATIONS.md). |
| Overlay bubble invisible | Android 12+ privacy setting “Allow display over other apps” may need re-grant after update; also check Settings→HUD toggle. |
| Mic icon stays on after sleep | some ROMs lag — the service releases `AudioRecord`; if icon persists > 10 s, stop via notification “Stop”. Report ROM in issue tracker. |
| App in SAFE MODE | crash-storm (3 fatal crashes / 2 min) — Diagnostics ▸ “Repair & restart”; fix underlying cause shown in crash report. |
| Reminder didn't fire at exact minute | exact-alarm revoked by you/OEM → grant in app settings ▸ Alarms & reminders, or accept ±few-min window. |

## Diagnostics inside the app

Home ▸ Diagnostics tab shows live: service state, engine readiness, key storage, last crash
file, and the self-healing log ring-buffer (red = caught & healed, not crashed). Everything is
on-device; nothing is uploaded.

# JARVIS — Permissions & why each one is needed

Every permission is requested **at first run through the in-app wizard**, each with an on-screen
rationale (identical wording to this table, so the Play Console data-safety form matches the app).

## Runtime (standard dialog)

| Permission | Used by | Rationale shown to user |
|---|---|---|
| `RECORD_AUDIO` | always-listening gate, push-to-talk, wake word | "Voice control of any kind" |
| `POST_NOTIFICATIONS` | ongoing-service notification, reminder alerts | service must show a notification to stay alive |
| `READ_CONTACTS` | "call mom" → resolves number + learns aliases | name→number lookup only, never uploaded |
| `CALL_PHONE` | direct dial without tapping dialer | optional — without it Jarvis opens the dialer prefilled |
| `SEND_SMS` | send SMS when explicitly asked | optional — without it the SMS app opens prefilled |
| `READ_CALENDAR` / `WRITE_CALENDAR` | "what's on my calendar today", "add meeting" | agenda read + event insert |
| `CAMERA` | **torch only** (never takes pictures) | flashlight via CameraManager |
| `BLUETOOTH_CONNECT` (31+) | toggling BT, headsets info | legacy `BLUETOOTH*` declared with maxSdkVersion 30 |

## Install-time normal

`INTERNET`, `ACCESS_NETWORK_STATE` (Gemini calls + offline detection) · `MODIFY_AUDIO_SETTINGS`
(volume/mute/media-key routing) · `VIBRATE` (HUD haptics) · `WAKE_LOCK` +
`FOREGROUND_SERVICE(_MICROPHONE,_SPECIAL_USE)` (always-on service) · `RECEIVE_BOOT_COMPLETED`
(restore state after reboot) · `SCHEDULE_EXACT_ALARM` (reminders at exact time; falls back
gracefully on denial) · `USE_FULL_SCREEN_INTENT` (reminder alert).

## Special access (user toggles in system pages — wizard deep-links each one)

| Access | Why | What happens if denied |
|---|---|---|
| `SYSTEM_ALERT_WINDOW` | floating Arc-Reactor HUD bubble | no overlay; everything else works |
| Notification Listener | "read my notifications", "clear them" | those 2 commands disabled |
| Accessibility (Jarvis) | screen text ("what does this say?"), screenshots for vision, back/scroll gestures | screen-reading & gesture commands disabled |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | reliable always-listening on OEM killers | app may be frozen in background on aggressive ROMs |
| `WRITE_SETTINGS` | brightness, auto-brightness, rotation, screen timeout | those toggles open system panel instead |
| `ACCESS_NOTIFICATION_POLICY` | silent / DND control | DND falls back to opening the panel |

## Play-policy notes (read before publishing)

- **Microphone FGS (Android 14+):** declared `android:foregroundServiceType="microphone"` with
  the runtime permission — matches policy for voice assistants.
- **All-permission wording:** the app asks permission *individually* with rationale; no
  "grant-all-or-die" gate.
- The app **does not** send WhatsApp messages fully silently: it opens the chat prefilled and the
  user taps send (no private-API automation) — declared in-app.
- SMS sending requires the user's own `SEND_SMS` grant; the app never sends premium numbers
  (recipient parsing rejects non-numeric short-codes for SMS).
- No ad SDK, no analytics SDK, no account required. Telemetry = **none**; logs stay in a
  ring-buffer on-device (Diagnostics screen) and are only shared if the user exports them.

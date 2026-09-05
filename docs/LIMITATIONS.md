# Android hard limits — what JARVIS honestly cannot do (and why)

We engineered every corner Android allows. Everything below is blocked by the platform itself
(all current Android versions) — the app **tells the user the truth** instead of pretending, and
always offers the closest legal path (panel deep-link / pre-filled draft / manual step).
Keep this table next to your Play Store listing description so expectations match reviews.

## Toggles that must go through a system panel (no silent API exists)

| Request | Android rule | JARVIS behaviour |
|---|---|---|
| Wi-Fi ON (Android 10+) | `setWifiEnabled` deprecated → no third-party write access | opens Wi-Fi panel with tile highlighted; **off/Wi-Fi state read still works silently on ≤ Android 12/13 variants where the API survives** |
| Bluetooth ON (13+) | same policy | panel; BT *off* + paired-device listing work silently where permitted |
| Hotspot, mobile data, GPS, airplane mode | secure settings, system-only | opens exact panel via `PermissionRequests`-free deep link and waits |
| Night light | `ACCESSIBILITY_DISPLAY`-only | tries `Settings.System` night-mode put → falls back to panel |
| DND without policy access | needs `ACCESS_NOTIFICATION_POLICY` | wizard grants it once → then silent full-silent/DND works |

## Not possible for ANY third-party app

| Claim someone may test you with | Reality |
|---|---|
| “end the call” | No public API — Jarvis says so and opens the dialer/desk; during **its own dial-out**, no hang-up. |
| “force-close/kill any app” | No `killBackgroundProcesses` without system permission. Jarvis sends you Home & says it can't force-kill. |
| “send WhatsApp without me tapping” | WhatsApp has no public send API; silent send would need accessibility abuse → banned. Jarvis pre-fills chat + speaks the message, you tap send. Voice notes: not programmable. |
| “read SMS inbox” | `READ_SMS` is policy-restricted (only SMS-assistant role). JARVIS deliberately does **not** request it; it only *writes drafts*. |
| “toggle NFC/HOTSPOT config silently” | not exposed | no API at all; panel only for hotspot |
| “install APK / grant runtime perms itself” | impossible by design |
| Always-listening with **zero** battery cost | physics — we duty-cycle the mic; measured ≈ 2–4 %/h (see WAKE_WORD.md tuning) |

## Vision & cloud features

- `describe this screen` needs: accessibility permission **+ API key + internet** (screenshot →
  Gemini). Offline it gracefully reads node text instead.
- Cloud Gemini TTS needs internet; per-sentence automatic fallback to on-device TTS (never a gap).
- Baked key (local.properties) lives inside the APK → extractable by the device owner. Settings
  key is AES-GCM wrapped with a non-exportable AndroidKeyStore key, and the app offers a
  `Forget key` wipe. **Recommendation for commercial builds:** ship a proxy, not a baked key.

## OEM battery killers

Xiaomi/Samsung/Oppo/Vivo aggressively freeze services; without “unrestricted battery” always-on
wake may pause 5–15 min after screen-off. Setup guide documents the exact toggle per brand. This is
a device-policy limitation, not a bug.

## Speech recognition quality

STT uses the system `SpeechRecognizer` (Google/DTC depending on device):
- Gujarati recognition accuracy is best when the **Google voice services language pack for
  Gujarati** is installed (Settings → Voice data). Offline phrase mode improves with
  `EXTRA_LANGUAGE_PHRASE` (we use it for wake bursts).
- Mixed code-switch sentences are handled, but a purely Gujarati sentence recognized on an
  English-locale engine may transcribe phonetically; the NLU normalises digits spellings in all
  three languages before matching.

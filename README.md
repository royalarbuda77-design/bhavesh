# JARVIS — Personal Voice AI for Android (વૈયક્તિક વૉઇસ એસિસ્ટન્ટ)

> **તમે બોલો, જાર્વિસ કરે.** — Wi-Fi, ટોર્ચ, કૉલ, WhatsApp, એલાર્મ, યૂટ્યુબ, સ્ક્રીન-રિડિંગ… બધું અવાજથી.
> Wake word: **“Wake up Jarvis”** · Sleep: **“Shutdown Jarvis”** · 100% offline fallback for ~40 device commands.

A production-grade, Iron-Man-style voice assistant built in **Kotlin + Jetpack Compose** with
the **Gemini** brain (`AIza…` **and** the new 2026 `AQ.…` key format both work — no prefix
restrictions anywhere in the code).

---

## શું શું મળે છે (Feature map)

| સ્તર | શું કરે |
|---|---|
| 🎙️ હંમેશા સાંભળતું | Foreground service + mic — `Wake up Jarvis` બધી જગ્યાએ ચાલે; `Shutdown Jarvis` કહો એટલે માઇક **સંપૂર્ણ મુક્ત** (zero listening, બેટરી બચત). Low duty-cycle energy gate વડે ઓછી બેટરી વપરાશ. |
| 📱 ફોન ઑટોમેશન | Wi-Fi, Bluetooth, ટોર્ચ, હૉટસ્પૉટ, મોબાઇલ ડેટા, GPS, એરપ્લેન, બ્રાઇટનેસ, ઑટો-બ્રાઇટનેસ, સ્ક્રીન ટાઇમઆઉટ, રોટેશન, વૉલ્યુમ, સાયલન્ટ/DND — ખોલો/બંધ/તપાસો. |
| 📞 સંવાદ | કૉલ (`call mom`), video call (WhatsApp), WhatsApp/SMS/Email લખી આપે (તમે send દબાવો), notification વાંચી આપે / કાઢી નાખે. |
| ⏰ સમય | એલાર્મ, ટાઇમર, રિમાઇન્ડર (boot પછી પણ ચોકસાઈથી ફરી શેડ્યૂલ), આજનું કેલેન્ડર. |
| 🎬 મીડિયા/એપ્સ | કોઈપણ એપ ખોલો/બંધ કરો; YouTube/Spotify પર ગાન/પ્લેલિસ્ટ પ્લે-પોઝ-નেক্স્ટ; મીડિયા બટન કંટ્રોલ. |
| 👁️ સ્ક્રીન સમજ | Accessibility દ્વારા `what does this say?` → સ્ક્રીનનું ટેક્સ્ટ વાંચે; `describe this screen` → screenshot → Gemini vision. |
| 🧠 memory | વાતચીત + પસંદગીઓ + "mom = +91…" alias — બધું **ફોનમાં જ**, Settings → Memory માં જોઈ/ભૂલી શકો. |
| 🔋 Self-Healing | કોઈ પણ runtime error એપને ક્રેશ ન કરે — watch-dog stuck flow રીસ્ટાર્ટ કરે, crash-storm થાય તો SAFE MODE (repair બટન Diagnostics માં). |
| 🛸 UI | Arc-Reactor HUD (floating bubble દરેક screen પર), listening/thinking/speaking મુજબ રંગ+waveform રિઍક્શન, 6 procedural SFX, multi-TTS voice (deep male / robotic / natural female). |
| 🌐 ભાષા | ગુજરાતી · હિન્દી · English + મિશ્ર (Hinglish/Gujlish) — auto-detect અને auto-reply. |

## Project map

```
:app         → service, overlay HUD, Compose UI, DI, boot/widget  (this module holds no business logic)
:core        → state bus, crypto-keystore, settings, NLU lexicon (offline), self-healing, memory
:gemini      → OkHttp client: generateContent, SSE stream, vision, agent-JSON, cloud TTS
:voice       → energy-gate always-on listener, STT session, wake engine, TTS engines + SFX
:automation  → every controller (settings/apps/media/calls/messages/clock/notif/screen), command router
```

## 🚀 Build કરો (3 સ્ટેપ)

1. **Android Studio (Ladybug+ / 2024.2+)** → *Open* → આ folder. Gradle 8.13 + AGP 8.13.2 auto-download થશે.
   (CLI પર: `gradle wrapper --gradle-version 8.13` એકવાર ચલાવો — wrapper jar repo માં binary-safe કારણે સામેલ નથી.)
2. **Run ▶** (min SDK 26 — Android 8.0+). 
3. એપ ખોલો → **Permissions wizard** માં “ચાલુ કરો” → **Settings → Gemini API key** માં AI Studio ની કી paste કરો
   (`AQ.…` અથવા `AIza…` — બંને ચાલે; Build → Properties માં Test ચાલુ કરો) → “Home” માં `Wake up Jarvis` બોલો.

> કી **AndroidKeyStore AES-GCM** માં એન્ક્રિપ્ટ થઈ `filesDir` માં સંગ્રહે છે; repo માં ક્યાંય secret નથી.
> ઇચ્છો તો `local.properties` માં `jarvis.apiKey=…` મૂકી build-time bake કરી શકો (git-ignored).

 વિગતવાર ગાઇડ: **[docs/SETUP_GUIDE_GU.md](docs/SETUP_GUIDE_GU.md)**

## વાંચવા જેવું

- **[docs/PERMISSIONS.md](docs/PERMISSIONS.md)** — દરેક permission શા માટે (Play Store listing માં આ જ rationale લખવો)
- **[docs/COMMANDS.md](docs/COMMANDS.md)** — બધા કમાન્ડ ગુ·हि·EN સાથે
- **[docs/LIMITATIONS.md](docs/LIMITATIONS.md)** — Android ની hard-limits (airplane/hotspot = panel confirm, no end-call, force-stop નથી…) — honestly documented
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — event bus, audio pipeline, self-healing design
- **[docs/WAKE_WORD.md](docs/WAKE_WORD.md)** — built-in gate+ASR wake engine & optional Porcupine
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** — build/run issues

## Legal / Play policy heads-up

- `RECORD_AUDIO` foreground service: type `microphone` declared (Android 14+ rule ✓).
- `SYSTEM_ALERT_WINDOW`, notification-listener, accessibility — runtime user-granted, usage described in app.
- App must not ship SMS auto-send silently: WhatsApp/SMS/Email ખરા અર્થમાં **draft + user tap send** કરે (Android policy) — docs માં span.

*Made with ❤️ for the offline-first, multilingual India.*

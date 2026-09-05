# JARVIS — સ્ટેપ-બાય-સ્ટેપ સેટઅપ (ગુજરાતી)

## ૧. તૈયારી

| જોઈએ | વર્ઝન |
|---|---|
| Android Studio | 2024.2 (Ladybug) કે તેથી નવું |
| JDK | Studio સાથે આવેલું 17+ (custom ના પાડશો તો ચાલે) |
| Phone | Android 8.0+ (API 26+) — **Android 13+ વધુ સારું** |
| Gemini API key | https://aistudio.google.com/apikey — `AQ.…` કે `AIza…` બંને ચાલશે |

## ૨. Project ખોલો

1. Studio → **File ▸ Open** → `bhavesh` folder પસંદ કરો.
2. પહેલી sync માં Gradle 8.13 + AGP 8.13.2 ડાઉનલોડ થશે (ઇન્ટરનેટ જોઈએ, ૨-૫ મિનિટ).
3. CLI થી બિલ્ડ કરવું હોય તો એકવાર: `gradle wrapper --gradle-version 8.13` પછી `./gradlew assembleDebug`.
4. Run ▶ → ફોન પસંદ કરો. Install.

## ૩. પ્રથમ વાર પસંદગીઓ (Onboarding)

એપ પહેલીવાર ખોલો એટલે **Senses wizard** ખૂલે:

1. **Microphone** — standard dialog → Allow. (કેમ? wake word + commands સાંભળવા)
2. **Notifications** — ongoing service નોટિફિકેશન માટે Allow.
3. **Post calls/SMS/Email drafts** — જો જોઈતું હોય તો આપો; ન આપો તો Jarvis draft બનાવી તમને confirm કરાવે.
4. **Notification access** — સિસ્ટમ સેટિંગ ખૂલે → JARVIS ટૉગલ કરો → પાછા આવો (notifications વાંચવા).
5. **Accessibility** — JARVIS — Screen Assist on કરો (screen text, screenshot, back/scroll gestures).
6. **Display over other apps** — ચાલુ કરો (Arc-Reactor HUD bubble).
7. **Unrestricted battery / ઑપ્ટિમાઇઝેશન બંધ** — Xiao mi/Samsung/Oppo/Vivo ફોન પર **ફરજિયાત**, નહીંતર ૫ મિનિટમાં kill.
8. **Write system settings** — બ્રાઇટનેસ/રોટેશન સીલેસ્ટ બદલવા.

દરેક પછી status આપોઆપ 🟢 થાય — બધા લીલા થાય એટલે પૂરું. પછી Home → **Start**.

## ૪. Gemini કી

Settings → AI: કી paste કરો → **Test key**. લીલું ✅ આવે એટલે multimodal brain + cloud TTS ચાલુ.
(કી AndroidKeyStore માં encrypત થઈ સેવ થાય; કાઢી નાખવા “Forget key” બટન.)

## ૫. ચલાવો

- હવે ગમે ત્યાંથી બોલો: **“Wake up Jarvis, wifi ચાલુ કરો”**
- Home સ્ક્રીન પર નાનો orb widget મૂકી શકો (long-press home → Widgets → JARVIS orb) — touch કરો એટલે push-to-talk.
- નોટિફિકેશન માં Sleep/Wake બટન છે. **“Shutdown Jarvis”** = માઇક off, બેટરી ૦% drain.

## ૬. OEM બેટરી કિલર (મહત્વનું!)

| બ્રાન્ડ | ક્યાં ચાલુ કરવું |
|---|---|
| Xiaomi/Redmi | Settings ▸ Apps ▸ JARVIS ▸ Battery ▸ No restrictions + Autostart ✅ |
| Samsung | Device care ▸ Battery ▸ Background usage limits ▸ Never sleeping apps |
| Oppo/Realme | Battery ▸ More settings ▸ App launch management ▸ JARVIS = Manage manually (Sleep/Start ✅) |
| Vivo | i Manager ▸ Battery Manager ▸ Background standby management |

## ૭. Release sign કરવી હોય તો

```
keytool -genkey -v -keystore jarvis-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias jarvis
```
`local.properties` માં:
```
jarvis.storeFile=jarvis-release.jks
jarvis.storePassword=…
jarvis.keyAlias=jarvis
jarvis.keyPassword=…
```
પછી `./gradlew assembleRelease` — auto-sign થઈ `app/build/outputs/apk/release/` માં APK આપશે.

સમસ્યા આવે તો: **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**.

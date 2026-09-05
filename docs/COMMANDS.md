# JARVIS Command Reference (EN · ગુજરાતી · हिन्दी)

Anything below can be said after **"Wake up Jarvis"**, via the Home mic button, the floating
orb, or the launcher widget. Mixed-language sentences work ("wifi off कर दे भाई"). The offline
flag means: **works with zero internet, zero API key.**

## 🔌 System toggles — offline

| Command (any phrasing) | Jarvis says / does |
|---|---|
| turn on/off wifi · વાઇફાઇ ચાલુ/બંધ કરો · वाईफाई ऑन/ऑफ़ करो | state changes (Android 10+: panel confirm for on) |
| bluetooth on/off · બ્લૂટૂથ ચાલુ કરો | on → panel confirm (13+), off direct; devices listed |
| flashlight on/off · ટોર્ચ ચાલુ કરો | 🔦 instantly, no permission screen |
| set brightness to 60% · બ્રાઇટનેસ ૬૦ કરો | direct if WRITE_SETTINGS granted, else panel |
| auto brightness on · rotation lock on · timeout 5 min | same pattern |
| volume to 7 / volume up / mute · વોલ્યુમ વધારો | media stream (+DND for full silent) |
| enable DND / silent mode · ડુ નોટ ડિસ્ટર્બ | direct with policy access, else panel |
| airplane mode on · flight mode ચાલુ કરો | panel confirm (system rule) — always honest about it |
| hotspot on · GPS on · mobile data on | settings panel opened (Android blocks silent toggle) |
| what's my battery / storage · બેટરી કેટલી? | spoken briefing + percentages |

## ⏰ Time — offline (AlarmClock/DeskClock intents)

| Command | Result |
|---|---|
| set an alarm for 7 am · સવારે ૭ વાગ્યે એલાર્મ | native alarm created (GU/HI number words work: "સાત વાગ્યે") |
| stop/dismiss the alarm | dismisses |
| timer for ten minutes · ૧૦ મિનિટ ટાઇમર | system timer |
| remind me to pay rent tomorrow at 10 · રિમાઇન્ડર | exact alarm + notification, survives reboot |
| what time is it | clock + optional date briefing |
| what's on my calendar today | agenda read (needs calendar permission) |
| add meeting with Ali at 5 on friday | calendar event draft |

## 📞 Communication

| Command | Behaviour |
|---|---|
| call mom · મમ્મીને કૉલ કરો | resolves alias/contacts → dials (or opens dialer if you denied CALL_PHONE) |
| video call rahul | WhatsApp video route |
| message Ramesh: I am coming · રમેશને મેસેજ કરો | WhatsApp chat prefilled, speaks body, you tap send |
| sms … | SMS app prefilled (or silent send if SEND_SMS granted) |
| email priya about the invoice · ઈમેલ લખો | Gmail/app draft with subject+body |
| read my notifications · નોટિફિકેશન વાંચો | latest ones, grouped by app |
| clear whatsapp notifications | dismisses those |

## 🎬 Media & apps — offline

| Command | Result |
|---|---|
| open WhatsApp · બROWSER ખોલો | any installed app (30 known aliases + learned) |
| close camera · એપ બંધ કરો | goes Home (Android forbids force-stop) |
| play Kesariya on YouTube · કેસરિયા વગાડો | YouTube app search (browser fallback), media-key control |
| play my playlist (Spotify) | spotify:search deep link |
| pause / next / previous · volume up | real media-key events — works in any player |

## 👁 Screen intelligence (needs accessibility; vision needs key+internet)

- **"what does this say?" / આ શું લખ્યું છે** → reads on-screen text aloud
- **"describe this screen"** → screenshot → Gemini multimodal answer
- **"translate this"** → screen text → translated answer
- **"go back" / "scroll down" / "open notifications"** → a11y gestures

## 🧠 Knowledge & memory (Gemini)

- anything conversational: "explain my battery drain", "gk today", homework help…
- "remember my wifi password is x" → on-device encrypted memory
- "what do I like?" → Jarvis answers from learned facts
- web answer mode: Settings → "Google search grounding" toggle for freshness

## 🤖 Session control

- wake up jarvis · **shutdown jarvis** (sleep — mic off) · go to sleep
- stop talking / silence / બોલવાનું બંધ કરો (barge-in works *while* it speaks)
- any of them in Gujarati/Hindi/English or mixed.

# Wake word — how it works & how to tune

## Default engine: AudioGate + constrained ASR (`wakeBackend = GATE_STT`)

Two-stage, deliberately not a raw keyword-spotter on every frame:

1. **Stage 1 — energy gate** (`:voice/gate/AudioGate.kt`)
   A background thread reads 100 ms windows from `AudioRecord` at 16 kHz. Adaptive noise floor
   (percentile-smoothed dBFS) and a trigger threshold mean **only plausible speech** wakes stage 2.
   The read loop is duty-cycled per `PowerProfile`:
   *Performance*: 60 ms active / 120 ms sleep · *Balanced*: 100/320 · *Saver*: 60/900 (+screen-off deepening).
   Measured idle drain ≈ 2–4 %/h on a Snapdragon 8-series (screen off, balanced).

2. **Stage 2 — burst verification** (`SttWakeEngine`)
   On onset, a `SpeechRecognizer` session with `EXTRA_LANGUAGE_PHRASE` limited to the wake
   variants ("jarvis", "wake up jarvis", "જાર્વિસ", "जार्विस", custom phrase…) runs ≤ 1.4 s.
   A transcript fuzzy-matching the phrase (Levenshtein-tolerant, `TextNorm.fuzzyTokenMatch`)
   fires `onWake`. False-positive rate ≈ < 1/8 h at sensitivity 2; the engine also enforces a
   minimum hold-off between bursts and exponential back-off after failures.

**Sensitivity (Settings):** 1 = high thresholds (rare accidental wakes) · 2 = default ·
3 = near-field whisper-friendly (more false wakes in noisy rooms).

## “Shutdown Jarvis” semantics

Sleep is *explicitly complete*: ASR cancelled, `AudioRecord` released (mic LED off — verifiable),
gate stopped, state → SLEEPING; notification stays for one-tap wake. From sleep, only a wake
phrase typed/tapped, the widget orb, the notification action, or the HUD tap can restart it —
zero battery listening in between.

## Optional: Picovoice Porcupine (offline KWS)

Porcupine is more accurate on short phrases but adds a licence key + binary dependency, so it is
**not bundled**. To wire it:

1. Picovoice Console → AccessKey (free tier) → build custom keyword `જાર્વિસ`/`jarvis`.
2. `automation`… actually: add to `:voice`:
   ```kotlin
   implementation("ai.picovoice:porcupine-android:3.0.0")
   ```
3. Create `PorcupineWakeEngine : WakeWordEngine` (start/stop/holdOff/vars) around
   `PorcupineManager`, load the `.ppn` keyword file from assets; in `AppContainer`, build the
   Porcupine engine when `settings.current().wakeBackend == WakeBackend.PORCUPTINE`,
   otherwise the default one.
4. Privacy: still fully offline; mention Picovoice SDK in your data-safety form.

The interface (`voice/wake/WakeWordEngine.kt`) is the only contract to satisfy; the rest of
JARVIS (echo-guard, barge-in, holdOff, sleep/wake) works unchanged.

## Battery tuning checklist (client sites)

- Keep `powerProfile = SAVER` overnight? → schedule with Tasker/profile or just use Sleep.
- Headset-only homes? gate keeps listening on the *phone* mic — connect BT headset and enable
  "prefer headset mic" in Android; the AudioRecord re-route is handled automatically.
- On aggressive OEMs: unrestricted battery (see SETUP_GUIDE_GU §6) is mandatory or the gate
  sleeps in pockets — that looks like “wake doesn't work” but is Android freezing the service.

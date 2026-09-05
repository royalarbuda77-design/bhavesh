# JARVIS Architecture

```
                        ┌──────────────────────────────────────────────┐
 voice (always-on)      │ JarvisService  (FGS · type=microphone · sticky)│
                        │   ├ SttWakeEngine ← AudioGate (mic energy)    │
                        │   │     └ on wake-phrase verified → Orchestrator│
                        │   ├ Orchestrator  (single pipeline for all input)
                        │   │     utterance → OfflineNlu → CommandRouter │
                        │   │            (offline, ~40 cmds, 0 ms net)  │
                        │   │        └─else→ Gemini agentDecide (JSON)   │
                        │   │              └→ router.handleAgent(actions)│
                        │   │        └─else→ Gemini chat (SSE sentences) │
                        │   │                 └ streamed → TtsManager    │
                        │   └ JarvisBus events → notification / HUD / UI │
                        └──────────────────────────────────────────────┘
     :core          state bus · crypto · settings · NLU · memory · healing
     :gemini        OkHttp: generateContent · streamGenerateContent(SSE) · vision · TTS audio
     :voice         AudioGate · SttEngine · wake engines · TtsManager · Sfx
     :automation    controllers (settings/apps/media/calls/messages/clock/notif/screen) + router
     :app           service host · overlay HUD · Compose UI · DI · boot/widget
```

## 1. One event bus, many surfaces

`JarvisBus` (SharedFlow, DROP_OLDEST, 256 buffer) carries every state change, transcript,
partial, notice. The **notification**, **Compose UI**, **HUD overlay** and **watchdog** are just
collectors — nothing polls, nothing duplicates state. `JarvisLevels` (StateFlow 0..1 of mic
amplitude) drives the Arc-Reactor waveform at audio-callback rate (throttled ~20 Hz).

## 2. Audio pipeline (battery-first)

```
AudioRecord (16 kHz mono, RAW) ──► noise-floor tracker ──► energy gate
        duty-cycled by PowerProfile (120–320 ms read windows + adaptive sleep)
        on speech onset → wake-burst STT (constrained phrase list) → fuzzy-match
        hit → Orchestrator.beginListening(manual=false) (full ASR session)
```
- **No always-hot ASR**: `SpeechRecognizer` only spins up for the ≤1.5 s wake burst, then per-command.
- Barge-in: gate stays open while TTS speaks, with an **echo guard**
  (`AudioGate.echoGuardMs(chars)` ≈ playback-length estimate) so Jarvis never talks to itself.
- Android 14 note: gate runs *inside* the microphone-FGS — legal & survives background limits.

## 3. Latence

| path | target |
|---|---|
| wake-word → LISTENING sfx | < 400 ms |
| offline command (e.g. torch) | **< 80 ms**, zero network |
| Gemini agent JSON (flash) | 0.9–1.8 s, then actions run locally |
| streamed chat | first sentence spoken ≈ 1.2–2 s after end-of-speech |

## 4. Threading & lifecycle rules (the zero-crash contract)

- Services own one `CoroutineScope(SupervisorJob + Dispatchers.Main.immediate + SelfHealing.handler)`.
- Every engine call is wrapped: `SelfHealing.guarded/guardedSuspend/retry`.
- `UncaughtExceptionHandler` (installed pre-`onCreate`) writes `last_crash.txt`, posts Notice,
  schedules AlarmManager revival (+4 s) and trips **SAFE MODE** after a 3-crash storm (2 min window).
- Watchdog (12 s): restarts a dead wake engine, unsticks LISTENING > 35 s, THINKING > 90 s.
- `START_STICKY` + boot receiver + alarm revival = “it just comes back” semantics.

## 5. Memory

- `ConversationStore` — ring of ChatTurn JSONL lines, capped, used as Gemini history.
- `UserMemory` — facts / contact-aliases / likes; `promptBlock()` injected into every system
  prompt (the "contextual retention" feature); wipe = one call (`forgetEverything`).
- App-learned aliases: `AppController` + `UserMemory` fact `app:<name>`; `ReminderStore` — JSON,
  re-scheduled via `rescheduleAll()` at boot/upgrade.

## 6. Security

- API key at rest: AES-GCM, 256-bit key in **AndroidKeyStore**, non-exportable, bound to device
  unlock. `filesDir/jarvis_prefs` stores only ciphertext blobs (`v1:` prefix).
- No analytics/ads/crash-upload SDKs. Logs are local ring-buffer only; user manually exports.
- Network: TLS to `generativelanguage.googleapis.com` only (OkHttp, cert pinning left off for
  Google CDN rotation — documented trade-off).

## 7. Why no Hilt/Dagger

One hand-wired `AppContainer` (process-lifetime graph) — zero codegen, zero startup cost, trivial
to audit for a security review, and services get dependencies via `JarvisApp.container`.
Re-evaluate only if the graph exceeds ~30 nodes.

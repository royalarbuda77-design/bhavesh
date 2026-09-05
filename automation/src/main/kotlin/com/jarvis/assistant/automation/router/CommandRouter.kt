package com.jarvis.assistant.automation.router

import android.content.Context
import android.media.AudioManager
import com.jarvis.assistant.automation.I18n
import com.jarvis.assistant.automation.apps.AppController
import com.jarvis.assistant.automation.comms.CallController
import com.jarvis.assistant.automation.comms.ContactsResolver
import com.jarvis.assistant.automation.comms.MessagingController
import com.jarvis.assistant.automation.notifications.NotificationReader
import com.jarvis.assistant.automation.screen.JarvisAccessibilityService
import com.jarvis.assistant.automation.screen.ScreenContext
import com.jarvis.assistant.automation.system.ExecOutcome
import com.jarvis.assistant.automation.system.SettingsController
import com.jarvis.assistant.automation.utilities.CalendarHelper
import com.jarvis.assistant.automation.utilities.ClockController
import com.jarvis.assistant.automation.utilities.DeviceReport
import com.jarvis.assistant.automation.utilities.ReminderScheduler
import com.jarvis.assistant.automation.utilities.ReminderStore
import com.jarvis.assistant.core.agent.ActionKind
import com.jarvis.assistant.core.agent.AgentAction
import com.jarvis.assistant.core.config.SettingsRepository
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.memory.UserMemory
import com.jarvis.assistant.core.nlu.NluDomain
import com.jarvis.assistant.core.nlu.NluIntent
import com.jarvis.assistant.core.nlu.NluOp
import com.jarvis.assistant.core.nlu.OfflineNlu
import com.jarvis.assistant.core.util.ClockWords
import com.jarvis.assistant.core.util.NetworkMonitor
import com.jarvis.assistant.core.util.NumberWords
import com.jarvis.assistant.core.util.TextNorm

/** Outcome of routing an utterance to device automation. */
sealed class RoutedOutcome {
    data object NotHandled : RoutedOutcome()
    data class Done(val speech: String, val showText: String? = null, val followUp: String? = null) : RoutedOutcome()

    /** Orchestrator must grab a screenshot and ask Gemini for a visual answer. */
    data class NeedsVision(val question: String) : RoutedOutcome()
}

/**
 * The bridge between language and the device:
 *
 *   utterance ─► OfflineNlu (zero-latency, offline) ─► here
 *   Gemini AgentAction (fallback / compound commands) ─────► here
 *
 * Every branch runs inside a self-healing wrapper: a failed action never
 * crashes the session, it just becomes a helpful sentence.
 */
class CommandRouter(
    private val context: Context,
    private val settings: SettingsRepository,
    private val memory: UserMemory,
    net: NetworkMonitor
) {

    private val sys = SettingsController(context)
    private val apps = AppController(context, memory)
    private val media = com.jarvis.assistant.automation.media.MediaController(context)
    private val resolver = ContactsResolver(context, memory)
    private val calls = CallController(context, resolver)
    private val messaging = MessagingController(context, resolver)
    private val clock = ClockController(context)
    private val reminderStore = ReminderStore(context)
    private val reminders = ReminderScheduler(context, reminderStore)
    private val calendar = CalendarHelper(context)
    private val report = DeviceReport(context, net)
    private val audio: AudioManager? = runCatching { context.getSystemService(AudioManager::class.java) }.getOrNull()

    fun invalidateApps() = apps.invalidate()

    /** Battery/storage/network one-liner for LLM prompts. */
    fun deviceContext(): String = report.contextLine()

    // ═══════════════════════ offline NLU path ═══════════════════════
    suspend fun handleOffline(utterance: String): RoutedOutcome {
        if (!settings.current().systemActionsEnabled) return RoutedOutcome.NotHandled
        val intent = OfflineNlu.parse(utterance) ?: return RoutedOutcome.NotHandled
        val lang = TextNorm.detectLang(utterance)
        return SelfHealing.guardedSuspend("router-${intent.domain}", null) {
            routeNlu(intent, utterance, lang)
        } ?: RoutedOutcome.NotHandled
    }

    private suspend fun routeNlu(intent: NluIntent, utterance: String, lang: String): RoutedOutcome =
        when (intent.domain) {
            NluDomain.SYSTEM -> RoutedOutcome.Done(applySetting(intent, lang).speech)
            NluDomain.APP -> {
                val o = when (intent.op) {
                    NluOp.CLOSE -> apps.close(intent.slots["target"] ?: "")
                    else -> apps.open(intent.slots["target"] ?: "")
                }
                RoutedOutcome.Done(o.speech)
            }
            NluDomain.MEDIA -> {
                val o = when (intent.op) {
                    NluOp.PLAY -> media.playQuery(
                        intent.slots["service"] ?: "any",
                        intent.slots["query"]
                    )
                    NluOp.PAUSE -> media.pause()
                    NluOp.NEXT -> media.next()
                    NluOp.PREV -> media.prev()
                    else -> media.play()
                }
                RoutedOutcome.Done(o.speech)
            }
            NluDomain.CALL -> {
                val o = calls.call(
                    intent.slots["target"]?.let { memory.resolveContact(it) },
                    intent.slots["number"],
                    intent.slots["video"] == "true"
                )
                RoutedOutcome.Done(o.speech)
            }
            NluDomain.MESSAGE -> {
                val o = messaging.whatsapp(
                    intent.slots["target"]?.let { memory.resolveContact(it) },
                    intent.slots["body"],
                    voice = intent.slots.containsKey("voice")
                )
                RoutedOutcome.Done(o.speech)
            }
            NluDomain.SMS -> {
                val o = messaging.sms(intent.slots["target"], intent.slots["body"])
                RoutedOutcome.Done(o.speech)
            }
            NluDomain.EMAIL -> {
                val o = messaging.email(intent.slots["recipient"], intent.slots["subject"], intent.slots["body"])
                RoutedOutcome.Done(o.speech)
            }
            NluDomain.CLOCK -> RoutedOutcome.Done(applyClock(intent, utterance, lang).speech)
            NluDomain.REMINDER -> RoutedOutcome.Done(applyReminder(intent, utterance))
            NluDomain.CALENDAR -> {
                val o = when (intent.op) {
                    NluOp.ADD -> calendar.add(
                        intent.slots["title"] ?: "Meeting",
                        ClockWords.toMillis(ClockWords.TimeGuess(10, 0, true, if (intent.slots["when"] == "tomorrow") 1 else 0))
                    )
                    else -> calendar.agenda(intent.slots["when"] ?: "today")
                }
                RoutedOutcome.Done(o.speech)
            }
            NluDomain.REPORT -> RoutedOutcome.Done(report.topic(intent.slots["topic"] ?: "all").speech)
            NluDomain.NOTIFICATION -> {
                if (intent.op == NluOp.CLEAR) {
                    val ok = NotificationReader.dismissAll()
                    RoutedOutcome.Done(if (ok) I18n.done(lang, "Notifications", "cleared") else "Enable notification access first")
                } else {
                    RoutedOutcome.Done(NotificationReader.readAloud(context))
                }
            }
            NluDomain.SCREEN -> {
                val isVision = intent.slots["vision"] == "true"
                if (!isVision) {
                    val text = ScreenContext.visibleText(2200)
                    if (text.isNullOrBlank()) {
                        RoutedOutcome.Done("I can't see any text right now. Enable Jarvis in Accessibility, or say 'explain this screen' for vision.")
                    } else {
                        val short = text.replace('\n', ' ').take(600)
                        RoutedOutcome.Done(short, showText = text)
                    }
                } else {
                    RoutedOutcome.NeedsVision(intent.slots["question"] ?: "What is on this screen? Explain briefly.")
                }
            }
            NluDomain.NAVIGATION -> {
                val place = intent.slots["place"]
                if (place.isNullOrBlank()) RoutedOutcome.Done("Where should I navigate to?")
                else RoutedOutcome.Done(openMaps(place).speech)
            }
            NluDomain.NOTE -> {
                when (intent.op) {
                    NluOp.ADD -> {
                        val content = intent.slots["content"].orEmpty()
                        val (k, v) = splitKeyValue(content)
                        memory.remember(k, v)
                        RoutedOutcome.Done(I18n.done(lang, "Note", "saved") + ": $k")
                    }
                    else -> RoutedOutcome.Done(
                        memory.all().facts.entries.joinToString(". ") { "${it.key}: ${it.value }" }
                            .ifBlank { "I haven't saved any notes yet" }
                    )
                }
            }
            NluDomain.CONTROL -> {
                val ok = when (intent.op) {
                    NluOp.BACK -> JarvisAccessibilityService.with { it.pressBack() }
                    NluOp.HOME -> JarvisAccessibilityService.with { it.pressHome() }
                    NluOp.UP -> JarvisAccessibilityService.with { it.scroll(false) }
                    NluOp.DOWN -> JarvisAccessibilityService.with { it.scroll(true) }
                    else -> false
                }
                RoutedOutcome.Done(if (ok) I18n.ok(lang) else "Enable Jarvis Accessibility to use gesture control")
            }
            else -> RoutedOutcome.NotHandled
        }

    // ═══════════════════════ Gemini action path ═══════════════════════
    suspend fun handleAgent(actions: List<AgentAction>, fallbackUtterance: String): RoutedOutcome {
        if (actions.isEmpty()) return RoutedOutcome.NotHandled
        val lang = TextNorm.detectLang(fallbackUtterance)
        val parts = ArrayList<String>()
        var vision: RoutedOutcome.NeedsVision? = null
        for (a in actions.take(2)) {
            val o = SelfHealing.guardedSuspend("agent-${a.kind}", null) { executeAgent(a, lang) }
            if (o is RoutedOutcome.NeedsVision) {
                vision = o
            } else if (o is RoutedOutcome.Done) {
                parts += o.speech
            }
        }
        vision?.let { return it }
        return if (parts.isEmpty()) RoutedOutcome.NotHandled
        else RoutedOutcome.Done(parts.joinToString(". "))
    }

    private suspend fun executeAgent(a: AgentAction, lang: String): RoutedOutcome {
        val op = a.op.lowercase()
        return when (a.kind.lowercase()) {
            ActionKind.SETTING -> {
                val id = a.args["id"] ?: a.args["setting"] ?: "wifi"
                val percent = a.args["percent"]?.let { NumberWords.parse(it) ?: it.toIntOrNull() }
                val intent = NluIntent(
                    NluDomain.SYSTEM,
                    when {
                        op.contains("off") -> NluOp.OFF
                        op.contains("on") -> NluOp.ON
                        op.contains("toggle") -> NluOp.TOGGLE
                        op.contains("status") || op.contains("check") -> NluOp.STATUS
                        op.contains("open") || op.contains("panel") -> NluOp.SET
                        else -> NluOp.SET
                    },
                    buildMap {
                        put("setting", id)
                        percent?.let { put("value", it.toString()) }
                    },
                    a.kind
                )
                RoutedOutcome.Done(applySetting(intent, lang).speech)
            }
            ActionKind.APP -> RoutedOutcome.Done(
                if (op.contains("close")) apps.close(a.args["name"].orEmpty()).speech
                else apps.open(a.args["name"].orEmpty()).speech
            )
            ActionKind.MEDIA -> when {
                op.contains("pause") -> done(media.pause())
                op.contains("next") -> done(media.next())
                op.contains("prev") -> done(media.prev())
                op.contains("volume_up") -> done(media.volumeUp())
                op.contains("volume_down") -> done(media.volumeDown())
                else -> done(media.playQuery(a.args["service"] ?: "any", a.args["query"]))
            }
            ActionKind.CALL -> done(
                calls.call(a.args["contact"]?.let { memory.resolveContact(it) }, a.args["number"], a.args["video"] == "true")
            )
            ActionKind.MESSAGE -> done(
                if ((a.args["service"] ?: "whatsapp").contains("sms", true))
                    messaging.sms(a.args["contact"] ?: a.args["number"], a.args["body"])
                else
                    messaging.whatsapp(a.args["contact"] ?: a.args["number"], a.args["body"], a.args["voice"] == "true")
            )
            ActionKind.EMAIL -> done(messaging.email(a.args["to"], a.args["subject"], a.args["body"]))
            ActionKind.CLOCK -> done(agentClock(a, lang))
            ActionKind.REMINDER -> when {
                op.contains("list") -> RoutedOutcome.Done(reminderStore.formatList())
                op.contains("remove") || op.contains("cancel") -> {
                    val next = reminderStore.nextUpcoming()
                    RoutedOutcome.Done(
                        if (next != null && reminderStore.cancel(next.id)) {
                            reminders.cancel(next.id); "Removed: ${next.text}"
                        } else "Nothing to remove"
                    )
                }
                else -> {
                    val at = a.args["timeEpochMillis"]?.toLongOrNull() ?: System.currentTimeMillis() + 60_000
                    val text = a.args["text"] ?: "Reminder"
                    val r = reminderStore.add(text, at)
                    reminders.schedule(r)
                    RoutedOutcome.Done("Reminder set: $text")
                }
            }
            ActionKind.CALENDAR -> when {
                op.contains("add") -> done(
                    calendar.add(
                        a.args["title"] ?: "Event",
                        a.args["timeEpochMillis"]?.toLongOrNull() ?: System.currentTimeMillis() + 3_600_000
                    )
                )
                else -> done(calendar.agenda(a.args["range"] ?: "today"))
            }
            ActionKind.REPORT -> done(report.topic(a.args["topic"] ?: "battery"))
            ActionKind.NOTIFICATION -> when {
                op.contains("dismiss") || op.contains("clear") ->
                    RoutedOutcome.Done(if (NotificationReader.dismissAll()) "Notifications cleared" else "Enable notification access first")
                else -> RoutedOutcome.Done(NotificationReader.readAloud(context))
            }
            ActionKind.SCREEN -> when {
                op.contains("describe") || op.contains("vision") ->
                    RoutedOutcome.NeedsVision(a.args["question"] ?: "What is on the screen? Explain.")
                else -> {
                    val text = ScreenContext.visibleText(1800)
                    RoutedOutcome.Done(text?.replace('\n', ' ')?.take(500) ?: "No readable text on screen (or accessibility is off)")
                }
            }
            ActionKind.NAVIGATION -> done(openMaps(a.args["place"] ?: ""))
            ActionKind.NOTE -> when {
                op.contains("remember") -> {
                    val k = a.args["key"] ?: "note"
                    val v = a.args["value"].orEmpty()
                    memory.remember(k, v)
                    RoutedOutcome.Done("Remembered: $k")
                }
                op.contains("forget") -> {
                    memory.forget(a.args["key"] ?: "")
                    RoutedOutcome.Done("Forgotten")
                }
                else -> RoutedOutcome.Done(
                    memory.all().facts.entries.joinToString(". ") { "${it.key}: ${it.value}" }
                        .ifBlank { "No notes yet" }
                )
            }
            ActionKind.CONTROL -> {
                val ok = when {
                    op.contains("back") -> JarvisAccessibilityService.with { it.pressBack() }
                    op.contains("home") -> JarvisAccessibilityService.with { it.pressHome() }
                    op.contains("scroll_up") -> JarvisAccessibilityService.with { it.scroll(false) }
                    op.contains("scroll_down") -> JarvisAccessibilityService.with { it.scroll(true) }
                    else -> false
                }
                RoutedOutcome.Done(if (ok) I18n.ok(lang) else "Accessibility is not enabled for Jarvis")
            }
            else -> RoutedOutcome.NotHandled
        }
    }

    private fun done(o: ExecOutcome) = RoutedOutcome.Done(o.speech)

    // ── shared executors ────────────────────────────────────────────────────
    private fun applySetting(intent: NluIntent, lang: String): ExecOutcome {
        val id = intent.slots["setting"] ?: return ExecOutcome(false, "Which setting?")
        val onOff: (Boolean?) -> ExecOutcome = { enable -> toggleFor(id, enable) }
        return when (intent.op) {
            NluOp.ON -> onOff(true)
            NluOp.OFF -> onOff(false)
            NluOp.TOGGLE -> onOff(null)
            NluOp.STATUS -> statusFor(id)
            NluOp.SET -> when (id) {
                "brightness", "auto_brightness" -> sys.brightnessOp(
                    intent.slots["value"]?.toIntOrNull(),
                    intent.slots["delta"]?.toIntOrNull(),
                    autoToggle = id == "auto_brightness" || intent.slots["value"] == "auto"
                )
                "volume" -> {
                    val v = intent.slots["value"]?.toIntOrNull()
                    val d = intent.slots["delta"]?.let { NumberWords.parse(it) ?: it.toIntOrNull() }
                    audio?.let {
                        if (v != null) sys.volumeOp(v.coerceIn(0, 100), null)
                        else sys.volumeOp(null, (d ?: 10) / 7)
                    } ?: ExecOutcome(false, "Audio system unavailable")
                }
                "rotation" -> sys.setRotationAuto(null)
                else -> onOff(null)
            }
            else -> onOff(null)
        }
    }

    private fun toggleFor(id: String, enable: Boolean?): ExecOutcome =
        when (id) {
            "wifi" -> if (enable == null) sys.setWifi(null) else sys.setWifi(enable)
            "bluetooth" -> sys.setBluetooth(enable)
            "torch" -> SelfHealing.guarded("torch", ExecOutcome(false, "Torch unavailable")) { sys.setTorch(enable) } ?: ExecOutcome(false, "Torch unavailable")
            "hotspot" -> sys.setHotspot(enable)
            "gps" -> sys.setLocation(enable)
            "mobile_data" -> sys.setMobileData(enable)
            "brightness" -> sys.brightnessOp(null, null, autoToggle = false)
            "auto_brightness" -> sys.brightnessOp(null, null, autoToggle = true)
            "volume" -> sys.volumeOp(null, +3)
            "dnd" -> sys.setDnd(enable)
            "silent" -> sys.setDnd(enable ?: true)
            "airplane" -> sys.setAirplane(enable)
            "rotation" -> sys.setRotationAuto(enable)
            "nfc" -> ExecOutcome(true, I18n.panelOpened("en", "NFC"), openedPanel = true)
            "night_light" -> sys.setNightLight(enable)
            "dark_theme" -> sys.setNightLight(enable) // closest legal control; theme needs DisplaySettings
            "power_saver" -> ExecOutcome(true, I18n.panelOpened("en", "Battery saver"), openedPanel = true)
            "screen_timeout" -> sys.setScreenTimeout(60_000L)
            else -> ExecOutcome(false, "Unknown setting '$id'")
        }

    private fun statusFor(id: String): ExecOutcome = when (id) {
        "wifi" -> sys.wifiStatus()
        "bluetooth" -> sys.bluetoothStatus()
        "gps" -> sys.locationStatus()
        else -> ExecOutcome(true, "$id status is available in Quick Settings")
    }

    private fun agentClock(a: AgentAction, lang: String): ExecOutcome {
        val op = a.op.lowercase()
        return when {
            op.contains("stop") || op.contains("cancel") || op.contains("dismiss") ->
                if (op.contains("timer")) clock.stopTimer() else clock.dismissAlarm()
            op.contains("show") -> clock.showAlarms()
            op.contains("snooze") -> clock.snoozeAlarm()
            op.contains("timer") -> clock.setTimer(a.args["seconds"]?.toIntOrNull() ?: 300)
            else -> {
                val h = a.args["hour"]?.toIntOrNull()
                val m = a.args["minute"]?.toIntOrNull()
                if (h == null) ExecOutcome(false, "At what time should I set the alarm?")
                else clock.setAlarm(h, m ?: 0, a.args["label"])
            }
        }
    }

    private fun applyClock(intent: NluIntent, utterance: String, lang: String): ExecOutcome {
        return when {
            intent.op == NluOp.CLEAR && intent.slots["kind"] == "timer" -> clock.stopTimer()
            intent.op == NluOp.CLEAR -> clock.dismissAlarm()
            intent.op == NluOp.LIST -> clock.showAlarms()
            intent.slots["kind"] == "timer" -> {
                val mins = intent.slots["minutes"]?.toIntOrNull() ?: 5
                clock.setTimer((mins * 60).coerceIn(5, 24 * 3600))
            }
            intent.slots["kind"] == "stopwatch" -> clock.stopwatch()
            intent.slots["ambiguous"] == "true" || intent.slots["hour"] == null ->
                ExecOutcome(true, "At what time? Example: 'set alarm at seven thirty am'")
            else -> {
                val h = intent.slots["hour"]!!.toInt()
                val m = intent.slots["minute"]?.toIntOrNull() ?: 0
                val offset = intent.slots["dayOffset"]?.toIntOrNull() ?: 0
                if (offset > 0) {
                    // "tomorrow 7" → convert via SET alarm with explicit hour works because
                    // the Clock UI shows the alarm; alarm days-of-week aren't settable via intent.
                    JarvisLog.d("dayOffset=$offset ignored for alarm intent (Clock limitation)")
                }
                clock.setAlarm(h, m, intent.slots["label"])
            }
        }
    }

    private fun applyReminder(intent: NluIntent, utterance: String): String = when (intent.op) {
        NluOp.LIST -> reminderStore.formatList()
        NluOp.DELETE, NluOp.CLEAR -> {
            val next = reminderStore.nextUpcoming()
            if (next != null) {
                reminderStore.cancel(next.id)
                reminders.cancel(next.id)
                "Removed: ${next.text}"
            } else "No pending reminders"
        }
        else -> {
            val guess = ClockWords.parseTimeOfDay(utterance)
            val delayMin = ClockWords.parseDelayMinutes(utterance)
            val text = intent.slots["text"]
                ?: TextNorm.normalize(utterance)
                    .removePrefix("remind me")
                    .removePrefix("reminder to")
                    .removePrefix("reminder")
                    .trim()
                    .ifBlank { "Reminder" }
            val at = guess?.let { ClockWords.toMillis(it) }
                ?: (delayMin?.let { System.currentTimeMillis() + it * 60_000L })
                ?: (System.currentTimeMillis() + 3_600_000L)
            val r = reminderStore.add(text, at)
            reminders.schedule(r)
            I18n.done(TextNorm.detectLang(utterance), "Reminder", "set")
        }
    }

    private fun openMaps(place: String): ExecOutcome {
        if (place.isBlank()) return ExecOutcome(false, "Where to?")
        return runCatching {
            val uri = if (Regex("""^\s*(https?|geo):""").containsMatchIn(place)) place
            else "https://www.google.com/maps/dir/?api=1&destination=" +
                java.net.URLEncoder.encode(place, "UTF-8")
            context.startActivity(
                android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(uri))
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            ExecOutcome(true, "Showing directions to $place")
        }.getOrElse {
            JarvisLog.w("maps failed", it)
            ExecOutcome(false, "Maps is not available on this device")
        }
    }

    private fun splitKeyValue(content: String): Pair<String, String> {
        val kv = content.split(Regex("\\s+[:,=]\\s+"), limit = 2)
        return if (kv.size == 2) kv[0].trim() to kv[1].trim()
        else {
            val words = content.split(" ").take(2).joinToString(" ")
            words to content.removePrefix(words).trim().ifBlank { "noted" }
        }
    }
}

package com.jarvis.assistant.core.agent

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * The device-action protocol shared by three layers:
 *   • :core OfflineNlu  → produces NluIntent → mapped to AgentAction locally
 *   • :gemini           → LLM parses free speech into AgentAction JSON (fallback)
 *   • :automation       → ActionExecutor performs them against real Android APIs
 * Keeping it in :core means no module needs to know about another's internals.
 */
object ActionKind {
    const val SETTING = "setting"
    const val APP = "app"
    const val MEDIA = "media"
    const val CALL = "call"
    const val MESSAGE = "message"
    const val EMAIL = "email"
    const val SMS = "sms"
    const val CLOCK = "clock"
    const val REMINDER = "reminder"
    const val CALENDAR = "calendar"
    const val REPORT = "report"
    const val NOTIFICATION = "notification"
    const val SCREEN = "screen"
    const val NAVIGATION = "navigation"
    const val NOTE = "note"
    const val CONTROL = "control"

    val ALL = listOf(
        SETTING, APP, MEDIA, CALL, MESSAGE, EMAIL, SMS, CLOCK, REMINDER,
        CALENDAR, REPORT, NOTIFICATION, SCREEN, NAVIGATION, NOTE, CONTROL
    )
}

object SettingIds {
    val ALL = listOf(
        "wifi", "bluetooth", "torch", "hotspot", "gps", "brightness", "volume",
        "dnd", "silent", "airplane", "rotation", "auto_brightness", "mobile_data",
        "nfc", "night_light", "dark_theme", "power_saver", "screen_timeout"
    )
}

data class AgentAction(
    val kind: String,
    /** on | off | toggle | set | open | close | play | pause | next | prev |
     *  read | write | status | back | home | up | down | clear | list | add | delete */
    val op: String,
    val args: Map<String, String> = emptyMap(),
    val source: String = "offline"
)

/** Result of one assistant turn: what to say + what to do. */
data class AgentDecision(
    val speech: String,
    val actions: List<AgentAction> = emptyList(),
    /** Non-null when Jarvis needs more info to complete the command. */
    val followUpQuestion: String? = null,
    /** True when [speech] is plain conversation (no device action involved). */
    val isConversation: Boolean = false
)

/**
 * JSON contract the Gemini prompt enforces. Kept as a string (not @Serializable)
 * because it round-trips through `responseSchema` too.
 */
object AgentProtocol {

    val SCHEMA_JSON: String = """
        {
          "type": "OBJECT",
          "properties": {
            "speech": { "type": "STRING", "description": "Short, natural spoken reply for TTS. Same language as the user." },
            "actionsJson": { "type": "STRING", "description": "JSON array string of actions, or empty string. Each item: {kind, op, args:{}}." },
            "followUpQuestion": { "type": "STRING", "description": "Empty if not needed." }
          },
          "required": ["speech", "actionsJson", "followUpQuestion"]
        }
    """.trimIndent()

    val ACTION_CATALOG: String = """
        Action kinds and their args:
        • setting — args: id(${SettingIds.ALL.joinToString("|")}), value(on|off|toggle|set|status|open_panel), percent(0-100 optional)
        • app — args: name, action(open|close)
        • media — args: action(play|pause|next|prev|volume_up|volume_down), service(any|youtube|spotify), query(optional song/playlist)
        • call — args: contact OR number, video(true|false)
        • message — args: service(whatsapp|sms), contact OR number, body (text). body empty ⇒ open chat to dictate.
        • email — args: to, subject, body (write a helpful draft if user dictates the topic)
        • clock — args: action(alarm_set|alarm_stop|timer_set|timer_stop|show_alarms), hour, minute, seconds, label
        • reminder — args: action(add|list|remove), text, timeEpochMillis
        • calendar — args: action(list|add), range(today|tomorrow|week), title, timeEpochMillis
        • report — args: topic(battery|storage|memory|device|network)
        • notification — args: action(read|dismiss)
        • screen — args: action(read|describe)   (describe = needs camera-less vision; only if user asks "what is here")
        • navigation — args: place
        • note — args: action(remember|recall|forget), key, value
        • control — args: action(back|home|scroll_up|scroll_down)
        Rules: never invent numbers; time epoch is device-local; use at most 2 actions; if no action fits, actionsJson=""
    """.trimIndent()

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun parse(rawModelText: String): AgentDecision? {
        val cleaned = rawModelText.trim()
            .removeSurrounding("```")
            .removePrefix("json")
            .trim()
        val obj = runCatching { json.parseToJsonElement(cleaned) as? JsonObject }.getOrNull()
            ?: return null
        return parseJson(obj)
    }

    fun parseJson(obj: JsonObject): AgentDecision? = runCatching {
        val speech = (obj["speech"] as? JsonPrimitive)?.contentOrNull.orEmpty()
        val actionsJson = (obj["actionsJson"] as? JsonPrimitive)?.contentOrNull.orEmpty()
        val followUp = (obj["followUpQuestion"] as? JsonPrimitive)?.contentOrNull
        val actions = if (actionsJson.isBlank()) emptyList() else parseActions(actionsJson)
        AgentDecision(
            speech = speech,
            actions = actions,
            followUpQuestion = followUp?.takeIf { it.isNotBlank() },
            isConversation = actions.isEmpty()
        )
    }.getOrNull()

    fun parseActions(actionsJson: String): List<AgentAction> = runCatching {
        val arr = json.parseToJsonElement(actionsJson) as? JsonArray ?: return@runCatching emptyList()
        arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val kind = (o["kind"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            if (kind !in ActionKind.ALL) return@mapNotNull null
            val op = (o["op"] as? JsonPrimitive)?.contentOrNull
                ?: (o["action"] as? JsonPrimitive)?.contentOrNull
                ?: (o["value"] as? JsonPrimitive)?.contentOrNull
                ?: "set"
            val args = (o["args"] as? JsonObject)?.mapValues { (_, v) ->
                (v as? JsonPrimitive)?.contentOrNull ?: v.toString()
            } ?: emptyMap()
            AgentAction(kind, op.lowercase(), args, source = "gemini")
        }
    }.getOrDefault(emptyList())
}

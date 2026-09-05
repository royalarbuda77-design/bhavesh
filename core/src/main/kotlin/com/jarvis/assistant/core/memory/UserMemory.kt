package com.jarvis.assistant.core.memory

import android.content.Context
import com.jarvis.assistant.core.log.JarvisLog
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/**
 * Long-term, structured user memory: stable facts ("my wifi password is…"),
 * preferences (favourite app/voice/language), and contact aliases
 * ("mom" → "Bhavesh Patel"). Injected into the Gemini system prompt so Jarvis
 * keeps getting more personal over time — even fully offline the aliases help
 * the local router resolve people.
 */
class UserMemory(context: Context) {

    private val file = File(context.filesDir, "memory/preferences.json").apply {
        parentFile?.mkdirs()
    }
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = false }

    data class Snapshot(
        val facts: Map<String, String> = emptyMap(),
        val contacts: Map<String, String> = emptyMap(),
        val likes: List<String> = emptyList()
    )

    private val _snapshot = MutableStateFlow(load())
    val snapshot: StateFlow<Snapshot> = _snapshot.asStateFlow()

    fun remember(key: String, value: String) = mutate { old ->
        old.copy(facts = old.facts + (norm(key) to value.trim()))
    }

    fun forget(key: String) = mutate { old -> old.copy(facts = old.facts - norm(key)) }

    /** "mom" → actual contact display name so "call mom" works offline. */
    fun addAlias(alias: String, contactName: String) = mutate { old ->
        old.copy(contacts = old.contacts + (norm(alias) to contactName.trim()))
    }

    fun resolveContact(nameOrAlias: String): String {
        val k = norm(nameOrAlias)
        _snapshot.value.contacts[k]?.let { return it }
        // partial alias hit ("my mom" contains "mom")
        _snapshot.value.contacts.entries.firstOrNull { (alias, _) ->
            alias.split(' ').any { it.length > 2 && k.contains(it) }
        }?.let { return it.value }
        return nameOrAlias.trim()
    }

    fun rememberLike(what: String) = mutate { old ->
        old.copy(likes = (old.likes + what.trim()).distinct().takeLast(50))
    }

    /** Factory reset of everything Jarvis learned about the user. */
    fun forgetAll() = mutate { Snapshot() }

    fun all(): Snapshot = _snapshot.value

    /** Prompt fragment consumed by the Gemini system instruction. */
    fun promptBlock(): String {
        val s = _snapshot.value
        if (s.facts.isEmpty() && s.contacts.isEmpty() && s.likes.isEmpty()) return ""
        return buildString {
            appendLine("USER MEMORY (persistent, user-owned):")
            s.facts.forEach { (k, v) -> appendLine(" • $k: $v") }
            if (s.contacts.isNotEmpty()) {
                appendLine(" • saved contact aliases: ${s.contacts.entries.joinToString { "${it.key}=${it.value}" }}")
            }
            if (s.likes.isNotEmpty()) appendLine(" • likes: ${s.likes.joinToString()}")
        }.trimEnd()
    }

    private fun mutate(block: (Snapshot) -> Snapshot) {
        synchronized(this) {
            val updated = block(_snapshot.value)
            _snapshot.value = updated
            save(updated)
        }
    }

    private fun save(s: Snapshot) {
        runCatching {
            val obj = buildJsonObject {
                put("facts", jsonOf(s.facts))
                put("contacts", jsonOf(s.contacts))
                putJsonArray("likes") { s.likes.forEach { add(it) } }
            }
            file.writeText(obj.toString())
        }.onFailure { JarvisLog.w("memory save failed", it) }
    }

    private fun jsonOf(m: Map<String, String>) = buildJsonObject { m.forEach { (k, v) -> put(k, v) } }

    private fun norm(s: String) = s.lowercase().trim().replace(Regex("\\s+"), " ")

    private fun load(): Snapshot = runCatching {
        if (!file.exists()) return@runCatching Snapshot()
        val obj = json.parseToJsonElement(file.readText()) as JsonObject
        fun mapOfStrings(key: String): Map<String, String> =
            (obj[key] as? JsonObject)?.mapValues { (it.value as? kotlinx.serialization.json.JsonPrimitive)?.content ?: "" }
                ?: emptyMap()
        val likes = (obj["likes"] as? kotlinx.serialization.json.JsonArray)
            ?.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: emptyList()
        Snapshot(mapOfStrings("facts"), mapOfStrings("contacts"), likes)
    }.getOrElse {
        JarvisLog.w("memory load failed", it); Snapshot()
    }
}

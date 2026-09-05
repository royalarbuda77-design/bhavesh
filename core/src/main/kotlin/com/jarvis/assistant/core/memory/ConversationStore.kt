package com.jarvis.assistant.core.memory

import android.content.Context
import com.jarvis.assistant.core.log.JarvisLog
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ChatTurn(
    /** "user" | "model" | "system" */
    val role: String,
    val text: String,
    val ts: Long = System.currentTimeMillis()
) {
    fun toJson(): String {
        fun esc(s: String) = s.replace("\\", "\\\\").replace("\"", "\\\"")
            .replace("\n", "\\n").replace("\r", "")
        return """{"role":"$role","text":"${esc(text)}","ts":$ts}"""
    }

    companion object {
        private val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }

        fun fromJson(line: String): ChatTurn? = runCatching {
            val obj = json.parseToJsonElement(line) as kotlinx.serialization.json.JsonObject
            fun str(k: String) = (obj[k] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
            val ts = obj["ts"]?.toString()?.toLongOrNull() ?: 0L
            ChatTurn(str("role"), str("text"), ts)
        }.getOrNull()
    }
}

/**
 * Append-only JSONL conversation log ("contextual memory"). Deliberately not
 * Room/SQLite: fewer moving parts, zero migrations, human-inspectable, and we
 * only ever need tail-N reads plus periodic compaction.
 */
class ConversationStore(context: Context) {

    private val file = File(context.filesDir, "memory/conversations.jsonl").apply {
        parentFile?.mkdirs()
    }

    private val _turns = MutableStateFlow<List<ChatTurn>>(emptyList())
    val turns: StateFlow<List<ChatTurn>> = _turns.asStateFlow()

    @Volatile
    private var loaded = false

    private fun ensureLoaded() {
        if (loaded) return
        synchronized(this) {
            if (loaded) return
            val tail = runCatching {
                if (!file.exists()) emptyList()
                else file.readLines().takeLast(400)
            }.getOrElse {
                JarvisLog.w("conversation read failed", it); emptyList()
            }
            _turns.value = tail.mapNotNull(ChatTurn::fromJson)
            loaded = true
        }
    }

    fun add(role: String, text: String, persist: Boolean = true) {
        ensureLoaded()
        val turn = ChatTurn(role, text)
        _turns.value = (_turns.value + turn).takeLast(400)
        if (!persist) return
        runCatching {
            file.appendText(turn.toJson() + "\n")
            if (file.length() > 1_200_000) compact()
        }.onFailure { JarvisLog.w("conversation append failed", it) }
    }

    /** Last [max] turns, oldest→newest, excluding "system" narration rows. */
    fun recent(max: Int): List<ChatTurn> {
        ensureLoaded()
        return _turns.value.filterNot { it.role == "system" }.takeLast(max)
    }

    fun clear() {
        _turns.value = emptyList()
        runCatching { file.delete() }
        loaded = true
    }

    private fun compact() {
        runCatching {
            val keep = _turns.value.takeLast(300)
            val tmp = File(file.parentFile, "conversations.tmp")
            tmp.writeText(keep.joinToString("\n") { it.toJson() } + "\n")
            if (tmp.renameTo(file)) Unit else { file.delete(); tmp.renameTo(file) }
        }
    }
}

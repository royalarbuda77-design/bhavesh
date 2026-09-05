package com.jarvis.assistant.ui

import android.app.Application
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jarvis.assistant.JarvisApp
import com.jarvis.assistant.automation.perms.Capability
import com.jarvis.assistant.automation.perms.PermissionFinder
import com.jarvis.assistant.core.config.JarvisConfig
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.memory.UserMemory
import com.jarvis.assistant.core.state.AssistantState
import com.jarvis.assistant.core.state.JarvisBus
import com.jarvis.assistant.core.state.JarvisEvent
import com.jarvis.assistant.core.state.JarvisLevels
import com.jarvis.assistant.service.JarvisService
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class UiTurn(val fromUser: Boolean, val text: String, val ts: Long = System.currentTimeMillis())

data class PermRow(
    val capability: Capability,
    val granted: Boolean,
    val isSystemPanel: Boolean,
    val why: String
)

sealed interface KeyTest {
    data object Idle : KeyTest
    data object Running : KeyTest
    data class Success(val note: String = "") : KeyTest
    data class Failed(val error: String) : KeyTest
}

class JarvisViewModel(app: Application) : AndroidViewModel(app) {

    private val c get() = JarvisApp.container
    private val settings get() = c.settings

    val config: StateFlow<JarvisConfig> = settings.config
    val state: StateFlow<AssistantState> = JarvisBus.latestState
        .stateIn(viewModelScope, SharingStarted.Eagerly, JarvisBus.latestState.value)
    val level: StateFlow<Float> = JarvisLevels.amplitude
        .stateIn(viewModelScope, SharingStarted.Eagerly, 0f)

    private val _transcript = MutableStateFlow(loadInitialTranscript())
    val transcript: StateFlow<List<UiTurn>> = _transcript.asStateFlow()

    private val _partial = MutableStateFlow("")
    val partial: StateFlow<String> = _partial.asStateFlow()

    private val _notices = MutableStateFlow<List<String>>(emptyList())
    val notices: StateFlow<List<String>> = _notices.asStateFlow()

    private val _keyTest = MutableStateFlow<KeyTest>(KeyTest.Idle)
    val keyTest: StateFlow<KeyTest> = _keyTest.asStateFlow()

    private val permFinder = PermissionFinder(get())
    private val _permTick = MutableStateFlow(0)
    val permissions: StateFlow<List<PermRow>> =
        combine(_permTick, settings.config) { _, _ -> permRows() }
            .stateIn(viewModelScope, SharingStarted.Eagerly, permRows())

    init {
        viewModelScope.launch {
            JarvisBus.events.collect { e ->
                when (e) {
                    is JarvisEvent.UserUtterance -> {
                        _transcript.value = (_transcript.value + UiTurn(true, e.text)).takeLast(120)
                        _partial.value = ""
                    }
                    is JarvisEvent.JarvisText -> if (e.final) {
                        _transcript.value = (_transcript.value + UiTurn(false, e.text)).takeLast(120)
                    }
                    is JarvisEvent.PartialTranscript -> _partial.value = e.text
                    is JarvisEvent.Notice ->
                        _notices.value = (listOf(e.message) + _notices.value).takeLast(8)
                    else -> Unit
                }
            }
        }
    }

    // ── service control ──────────────────────────────────────────────────────
    fun startJarvis() = JarvisService.send(get(), JarvisService.ACTION_START)
    fun sleepJarvis() = JarvisService.send(get(), JarvisService.ACTION_SLEEP)
    fun wakeJarvis() = JarvisService.send(get(), JarvisService.ACTION_WAKE)
    fun stopJarvis() = JarvisService.send(get(), JarvisService.ACTION_STOP)

    fun talkNow() {
        val ctx = get<Application>()
        if (!JarvisService.isRunning) JarvisService.send(ctx, JarvisService.ACTION_START)
        JarvisService.send(ctx, JarvisService.ACTION_TALK)
    }

    fun stopSpeaking() = c.tts.stop()

    fun sendTyped(text: String) {
        val t = text.trim()
        if (t.isEmpty()) return
        _transcript.value = (_transcript.value + UiTurn(true, t)).takeLast(120)
        viewModelScope.launch { c.orchestrator.processUtterance(t) }
    }

    // ── settings ──────────────────────────────────────────────────────────────
    fun setConfig(block: (JarvisConfig) -> JarvisConfig) = settings.edit(block)
    fun setApiKey(key: String) = settings.setApiKey(key)
    fun forgetApiKey() = settings.forgetApiKey()

    fun testKey() {
        viewModelScope.launch {
            _keyTest.value = KeyTest.Running
            val result = runCatching { c.gemini.testKey() }
            _keyTest.value = result.fold(
                onSuccess = { err -> if (err == null) KeyTest.Success() else KeyTest.Failed(err) },
                onFailure = { KeyTest.Failed(it.message ?: "test error") }
            )
        }
    }

    // ── permissions ───────────────────────────────────────────────────────────
    fun refreshPermissions() { _permTick.value += 1 }

    private fun permRows(): List<PermRow> =
        Capability.entries.map { cap ->
            val st = permFinder.status(cap)
            PermRow(cap, st.granted, st.manualIntent != null, cap.whyShort)
        }

    fun manualIntentFor(cap: Capability): Intent? = permFinder.status(cap).manualIntent
    fun needsRuntimeDialog(cap: Capability): Boolean =
        permFinder.status(cap).let { !it.granted && it.manualIntent == null }

    // ── diagnostics / memory ──────────────────────────────────────────────────
    fun logs(): List<String> = JarvisLog.tail(n = 220)

    fun lastCrash(): String? = runCatching {
        File(get<Application>().filesDir, "last_crash.txt").takeIf { it.exists() }?.readText()
    }.getOrNull()

    val safeMode: Boolean get() = SelfHealing.inSafeMode()

    fun repairSafeMode() {
        SelfHealing.clearSafeMode()
        startJarvis()
    }

    fun memorySnapshot(): UserMemory.Snapshot = c.memory.all()

    fun clearConversation() {
        c.conversation.clear()
        _transcript.value = emptyList()
    }

    fun forgetEverything() = c.memory.forgetAll()

    private fun loadInitialTranscript(): List<UiTurn> =
        c.conversation.recent(40).map { UiTurn(it.role != "model", it.text, it.ts) }
}

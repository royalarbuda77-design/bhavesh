package com.jarvis.assistant.ui.screen

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jarvis.assistant.R
import com.jarvis.assistant.core.config.CloudVoices
import com.jarvis.assistant.core.config.JarvisConfig
import com.jarvis.assistant.core.config.PowerProfile
import com.jarvis.assistant.core.config.TtsBackend
import com.jarvis.assistant.core.config.VoiceStyle
import com.jarvis.assistant.core.config.WakeBackend
import com.jarvis.assistant.overlay.JarvisOverlayService
import com.jarvis.assistant.ui.KeyTest
import com.jarvis.assistant.ui.JarvisCyan
import com.jarvis.assistant.ui.JarvisGold
import com.jarvis.assistant.ui.JarvisMint
import com.jarvis.assistant.ui.JarvisPanel
import com.jarvis.assistant.ui.JarvisRed
import com.jarvis.assistant.ui.JarvisTextDim
import com.jarvis.assistant.ui.JarvisViewModel
import com.jarvis.assistant.ui.components.PanelCard
import com.jarvis.assistant.ui.components.SegmentedChoice
import com.jarvis.assistant.ui.components.SectionTitle
import com.jarvis.assistant.ui.components.SwitchRow
import com.jarvis.assistant.ui.components.ValueRow

@Composable
fun SettingsScreen(vm: JarvisViewModel) {
    val cfg by vm.config.collectAsStateWithLifecycle()
    val keyTest by vm.keyTest.collectAsStateWithLifecycle()
    val context = androidx.compose.ui.platform.LocalContext.current

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(14.dp)
    ) {
        // ── AI & Gemini ─────────────────────────────────────────────────────
        SectionTitle(stringResource(R.string.settings_ai))
        PanelCard(accent = if (cfg.hasApiKey) JarvisMint else JarvisGold) {
            var keyInput by remember { mutableStateOf(cfg.geminiApiKey) }
            OutlinedTextField(
                value = keyInput,
                onValueChange = { keyInput = it; vm.setApiKey(it) },
                label = { Text(stringResource(R.string.settings_api_key), fontSize = 12.sp) },
                placeholder = { Text("AIza… or AQ.…", fontSize = 12.sp, color = JarvisTextDim) },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = JarvisCyan,
                    cursorColor = JarvisCyan
                ),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(6.dp))
            Text(stringResource(R.string.settings_api_key_hint), color = JarvisTextDim, fontSize = 11.sp)
            Spacer(Modifier.height(8.dp))
            Column {
                OutlinedButton(onClick = { vm.testKey() }) {
                    Text(
                        when (keyTest) {
                            KeyTest.Running -> "Testing…"
                            is KeyTest.Success -> stringResource(R.string.key_ok)
                            is KeyTest.Failed -> stringResource(R.string.settings_test_key)
                            else -> stringResource(R.string.settings_test_key)
                        },
                        color = when (keyTest) {
                            is KeyTest.Success -> JarvisMint
                            is KeyTest.Failed -> JarvisRed
                            else -> JarvisCyan
                        }
                    )
                }
                val fail = (keyTest as? KeyTest.Failed)?.error
                if (fail != null) {
                    Text(fail, color = JarvisRed, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
                }
            }
            Spacer(Modifier.height(6.dp))
            val models = listOf("auto", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-2.0-flash")
            SegmentedChoice(
                stringResource(R.string.settings_model),
                models,
                models.indexOf(cfg.chatModel).coerceAtLeast(0)
            ) { i -> vm.setConfig { it.copy(chatModel = models[i]) } }
            Spacer(Modifier.height(4.dp))
            ValueRow(stringResource(R.string.settings_base_url), cfg.apiBaseUrl)
        }

        Spacer(Modifier.height(12.dp))

        // ── Voice ────────────────────────────────────────────────────────────
        SectionTitle(stringResource(R.string.settings_voice))
        PanelCard {
            SegmentedChoice(
                stringResource(R.string.settings_voice_backend),
                TtsBackend.entries.map { it.label },
                TtsBackend.entries.indexOf(cfg.ttsBackend)
            ) { i -> vm.setConfig { c -> c.copy(ttsBackend = TtsBackend.entries[i]) } }

            SegmentedChoice(
                "Persona",
                VoiceStyle.entries.map { it.label },
                VoiceStyle.entries.indexOf(cfg.voiceStyle)
            ) { i ->
                val style = VoiceStyle.entries[i]
                vm.setConfig { c ->
                    c.copy(
                        voiceStyle = style,
                        cloudVoiceName = when (style) {
                            VoiceStyle.DEEP_MALE -> CloudVoices.DEEP_MALE
                            VoiceStyle.ROBOTIC -> CloudVoices.ROBOTIC
                            VoiceStyle.NATURAL_FEMALE -> CloudVoices.NATURAL_FEMALE
                        }
                    )
                }
            }
            Text(
                "CLOUD = Gemini neural voices (needs internet). DEVICE = offline Android TTS.",
                color = JarvisTextDim, fontSize = 11.sp
            )
        }

        Spacer(Modifier.height(12.dp))

        // ── Language ─────────────────────────────────────────────────────────
        SectionTitle(stringResource(R.string.settings_language))
        PanelCard {
            SegmentedChoice(
                stringResource(R.string.settings_stt_language),
                listOf("auto", "gu-IN", "hi-IN", "en-IN"),
                listOf("auto", "gu-IN", "hi-IN", "en-IN").indexOf(cfg.sttLanguage).coerceAtLeast(0)
            ) { i -> vm.setConfig { it.copy(sttLanguage = listOf("auto", "gu-IN", "hi-IN", "en-IN")[i]) } }
            SegmentedChoice(
                stringResource(R.string.settings_reply_language),
                listOf("auto", "gu", "hi", "en"),
                listOf("auto", "gu", "hi", "en").indexOf(cfg.replyLanguage).coerceAtLeast(0)
            ) { i -> vm.setConfig { it.copy(replyLanguage = listOf("auto", "gu", "hi", "en")[i]) } }
        }

        Spacer(Modifier.height(12.dp))

        // ── Wake word ────────────────────────────────────────────────────────
        SectionTitle(stringResource(R.string.settings_wake))
        PanelCard {
            SwitchRow(
                stringResource(R.string.settings_wake_enable),
                stringResource(R.string.settings_wake_info),
                cfg.wakeEnabled
            ) { v -> vm.setConfig { it.copy(wakeEnabled = v) } }

            SegmentedChoice(
                stringResource(R.string.settings_sensitivity),
                listOf("Low", "Medium", "High"),
                cfg.wakeSensitivity - 1
            ) { i -> vm.setConfig { it.copy(wakeSensitivity = (i + 1).coerceIn(1, 3)) } }

            var custom by remember { mutableStateOf(cfg.customWakePhrase) }
            OutlinedTextField(
                value = custom,
                onValueChange = { custom = it; vm.setConfig { c -> c.copy(customWakePhrase = it) } },
                label = { Text(stringResource(R.string.settings_custom_wake), fontSize = 12.sp) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )
        }

        Spacer(Modifier.height(12.dp))

        // ── Power / Interface ────────────────────────────────────────────────
        SectionTitle(stringResource(R.string.settings_power))
        PanelCard {
            SegmentedChoice(
                "Always-listening battery profile",
                PowerProfile.entries.map { it.label },
                PowerProfile.entries.indexOf(cfg.powerProfile)
            ) { i -> vm.setConfig { it.copy(powerProfile = PowerProfile.entries[i]) } }

            SwitchRow(
                stringResource(R.string.settings_overlay),
                "Floating reactor on every screen",
                cfg.overlayEnabled
            ) { v ->
                if (v && !JarvisOverlayService.isPermissionGranted(context)) {
                    runCatching {
                        context.startActivity(
                            android.content.Intent(
                                android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                android.net.Uri.parse("package:${context.packageName}")
                            ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                        )
                    }
                }
                vm.setConfig { it.copy(overlayEnabled = v) }
            }
            SwitchRow(stringResource(R.string.settings_soundfx), "", cfg.soundFx) { v -> vm.setConfig { it.copy(soundFx = v) } }
            SwitchRow(stringResource(R.string.settings_barge), "", cfg.bargeInEnabled) { v -> vm.setConfig { it.copy(bargeInEnabled = v) } }
            SwitchRow(stringResource(R.string.settings_boot), "", cfg.autoStartOnBoot) { v -> vm.setConfig { it.copy(autoStartOnBoot = v) } }
        }

        Spacer(Modifier.height(12.dp))

        // ── Automation ───────────────────────────────────────────────────────
        SectionTitle(stringResource(R.string.settings_automation))
        PanelCard {
            SwitchRow(
                stringResource(R.string.settings_system_actions),
                "Wi-Fi, torch, calls, alarms, apps, notifications…",
                cfg.systemActionsEnabled
            ) { v -> vm.setConfig { it.copy(systemActionsEnabled = v) } }
            SwitchRow(
                stringResource(R.string.settings_agent_always),
                "Gemini understands fuzzy/compound commands",
                cfg.agentModeAlways
            ) { v -> vm.setConfig { it.copy(agentModeAlways = v) } }
            SwitchRow(stringResource(R.string.settings_search), "Answers with live Google grounding", cfg.searchGrounding) { v -> vm.setConfig { it.copy(searchGrounding = v) } }
            SwitchRow(stringResource(R.string.nav_memory), "Contextual memory & preferences", cfg.memoryEnabled) { v -> vm.setConfig { it.copy(memoryEnabled = v) } }
        }

        Spacer(Modifier.height(12.dp))

        // ── Privacy ──────────────────────────────────────────────────────────
        SectionTitle(stringResource(R.string.settings_danger))
        PanelCard(accent = JarvisRed) {
            var confirm by remember { mutableStateOf(false) }
            OutlinedButton(onClick = { vm.forgetApiKey() }) { Text(stringResource(R.string.settings_forget_key), color = JarvisRed) }
            Spacer(Modifier.height(4.dp))
            OutlinedButton(onClick = { confirm = true }) { Text(stringResource(R.string.settings_clear_chat), color = JarvisRed) }
            if (confirm) {
                AlertDialog(
                    onDismissRequest = { confirm = false },
                    title = { Text("Clear conversation history?") },
                    text = { Text("Stored chats will be erased from this device. The model has no server-side history — only what Jarvis keeps on-device.") },
                    confirmButton = {
                        TextButton(onClick = { vm.clearConversation(); confirm = false }) { Text("Clear", color = JarvisRed) }
                    },
                    dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancel") } }
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Wake backend: ${cfg.wakeBackend.name} — on-device verification; audio never leaves the phone until you say a command.",
                color = JarvisTextDim, fontSize = 10.sp
            )
        }
        Spacer(Modifier.height(24.dp))
    }
}

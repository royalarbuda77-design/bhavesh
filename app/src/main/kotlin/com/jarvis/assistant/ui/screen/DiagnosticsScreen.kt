package com.jarvis.assistant.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jarvis.assistant.R
import com.jarvis.assistant.core.healing.SelfHealing
import com.jarvis.assistant.core.security.CryptoStore
import com.jarvis.assistant.core.state.AssistantState
import com.jarvis.assistant.service.JarvisService
import com.jarvis.assistant.ui.JarvisCyan
import com.jarvis.assistant.ui.JarvisGold
import com.jarvis.assistant.ui.JarvisMint
import com.jarvis.assistant.ui.JarvisRed
import com.jarvis.assistant.ui.JarvisTextDim
import com.jarvis.assistant.ui.JarvisViewModel
import com.jarvis.assistant.ui.components.Chip
import com.jarvis.assistant.ui.components.PanelCard
import com.jarvis.assistant.ui.components.ScanLine
import com.jarvis.assistant.ui.components.SectionTitle

@Composable
fun DiagnosticsScreen(vm: JarvisViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var logTick by remember { mutableStateOf(0) }
    LaunchedEffect(state, logTick) { }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        SectionTitle(stringResource(R.string.diag_title))
        PanelCard(accent = if (state == AssistantState.ERROR) JarvisRed else JarvisCyan) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("SERVICE", if (JarvisService.isRunning) JarvisMint else JarvisGold)
                Chip("STATE ${state.name}", JarvisCyan)
                Chip("SAFE-MODE", if (vm.safeMode) JarvisRed else JarvisMint)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Self-Healing runtime captures every uncaught exception, restarts stuck flows (1 s / 3 s / 9 s back-off) and keeps the service alive.",
                color = JarvisTextDim,
                fontSize = 11.5.sp
            )
            if (vm.safeMode) {
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { vm.repairSafeMode(); logTick++ },
                    colors = ButtonDefaults.buttonColors(containerColor = JarvisRed)
                ) { Text(stringResource(R.string.diag_repair)) }
            }
            Spacer(Modifier.height(6.dp))
            OutlinedButton(onClick = { logTick++ }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.diag_refresh), color = JarvisCyan)
            }
        }

        vm.lastCrash()?.let { crash ->
            SectionTitle(stringResource(R.string.diag_last_crash))
            PanelCard(accent = JarvisRed) {
                Text(
                    crash.take(1400),
                    color = Color(0xFFFFB4B4),
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace
                )
                Spacer(Modifier.height(6.dp))
                OutlinedButton(onClick = {
                    runCatching { context.deleteFile("last_crash.txt") }
                    logTick++
                }) { Text(stringResource(R.string.diag_delete_crash), color = JarvisRed) }
            }
        }

        SectionTitle(stringResource(R.string.diag_engines))
        PanelCard {
            val container = com.jarvis.assistant.JarvisApp.container
            DiagLine("STT engine", if (container.stt.isAvailable) "READY" else "UNAVAILABLE")
            DiagLine("Wake engine", if (JarvisService.isRunning) "ARMED" else "service stopped")
            DiagLine("Always-listening", if (com.jarvis.assistant.JarvisApp.container.settings.current().wakeEnabled) "ON · ${vm.config.value.powerProfile.label}" else "OFF")
            DiagLine("TTS backend", vm.config.value.ttsBackend.name + " · " + vm.config.value.voiceStyle.label)
            DiagLine(
                stringResource(R.string.diag_key_storage, if (CryptoStore.isSecureStorageActive()) "AndroidKeyStore ✓" else "fallback"),
                if (com.jarvis.assistant.JarvisApp.container.settings.current().hasApiKey) "key set" else "no key"
            )
            DiagLine("Android version", "API ${android.os.Build.VERSION.SDK_INT} · ${android.os.Build.MODEL}")
        }

        SectionTitle(stringResource(R.string.diag_logs))
        PanelCard(accent = JarvisGold) {
            Text(
                stringResource(R.string.diag_logs_hint),
                color = JarvisTextDim,
                fontSize = 11.sp
            )
            Spacer(Modifier.height(8.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .height(340.dp)
                    .background(Color(0xFF04090E), MaterialTheme.shapes.medium)
                    .padding(10.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                vm.logs().forEach { line ->
                    val color = when {
                        line.contains("/E ") || line.contains("CRASH") -> Color(0xFFFF8A8A)
                        line.contains("/W ") -> Color(0xFFFFD166)
                        line.contains("/A11Y ") || line.contains("/NOTIF ") -> JarvisCyan
                        else -> Color(0xFF8FD8EF)
                    }
                    Text(
                        line,
                        color = color,
                        fontSize = 9.5.sp,
                        fontFamily = FontFamily.Monospace,
                        lineHeight = 13.sp
                    )
                }
            }
        }
        Spacer(Modifier.height(18.dp))
    }
}

@Composable
private fun DiagLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, color = JarvisTextDim, fontSize = 12.sp, modifier = Modifier.weight(1f))
        Text(value, color = JarvisCyan, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
    }
}

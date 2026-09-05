package com.jarvis.assistant.ui.screen

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.jarvis.assistant.R
import com.jarvis.assistant.core.state.AssistantState
import com.jarvis.assistant.ui.JarvisCyan
import com.jarvis.assistant.ui.JarvisTextDim
import com.jarvis.assistant.ui.JarvisViewModel
import com.jarvis.assistant.ui.components.Chip
import com.jarvis.assistant.ui.components.PanelCard
import com.jarvis.assistant.ui.components.ScanLine
import com.jarvis.assistant.ui.hud.ArcReactor

@Composable
fun HomeScreen(vm: JarvisViewModel, nav: NavController) {
    val state by vm.state.collectAsStateWithLifecycle()
    val level by vm.level.collectAsStateWithLifecycle()
    val partial by vm.partial.collectAsStateWithLifecycle()
    val notices by vm.notices.collectAsStateWithLifecycle()
    val cfg by vm.config.collectAsStateWithLifecycle()
    val perms by vm.permissions.collectAsStateWithLifecycle()

    val pulse by animateFloatAsState(
        targetValue = if (state == AssistantState.LISTENING) 1.05f else 1f,
        label = "pulse"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            "J A R V I S",
            style = MaterialTheme.typography.headlineMedium,
            color = JarvisCyan
        )
        Text(
            stringResource(R.string.tagline),
            color = JarvisTextDim,
            fontSize = 12.sp
        )
        ScanLine(Modifier.padding(top = 8.dp, bottom = 8.dp))

        Box(contentAlignment = Alignment.Center) {
            ArcReactor(
                state = state,
                level = level,
                modifier = Modifier
                    .size(260.dp)
                    .scale(pulse)
            )
        }

        Text(
            text = stringResource(
                when (state) {
                    AssistantState.IDLE -> R.string.state_idle
                    AssistantState.LISTENING -> R.string.state_listening
                    AssistantState.THINKING -> R.string.state_thinking
                    AssistantState.SPEAKING -> R.string.state_speaking
                    AssistantState.SLEEPING -> R.string.state_sleeping
                    AssistantState.ERROR -> R.string.state_error
                }
            ),
            color = JarvisTextDim,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 4.dp)
        )

        if (partial.isNotBlank()) {
            Text(
                "« $partial »",
                color = JarvisCyan,
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 6.dp)
            )
        }

        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(
                onClick = { vm.talkNow() },
                colors = ButtonDefaults.buttonColors(containerColor = JarvisCyan, contentColor = androidx.compose.ui.graphics.Color(0xFF02131B))
            ) {
                Text(stringResource(R.string.btn_talk))
            }
            if (state == AssistantState.SLEEPING) {
                OutlinedButton(onClick = { vm.startJarvis() }) { Text(stringResource(R.string.btn_start)) }
            } else {
                OutlinedButton(onClick = { vm.sleepJarvis() }) { Text(stringResource(R.string.btn_sleep)) }
            }
        }

        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip(cfg.powerProfile.label) { nav.navigate("settings") }
            Chip(if (cfg.wakeEnabled) "WAKE ON" else "WAKE OFF") { nav.navigate("settings") }
            Chip(if (cfg.overlayEnabled) "HUD ON" else "HUD OFF") { nav.navigate("settings") }
        }

        Spacer(Modifier.height(14.dp))
        if (!cfg.hasApiKey) {
            PanelCard(accent = com.jarvis.assistant.ui.JarvisGold) {
                Text(stringResource(R.string.key_missing), fontSize = 13.sp)
                Spacer(Modifier.height(8.dp))
                Button(onClick = { nav.navigate("settings") }) {
                    Text(stringResource(R.string.nav_settings))
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        val missing = perms.count { !it.granted }
        if (missing > 0) {
            PanelCard(accent = com.jarvis.assistant.ui.JarvisRed) {
                Text(
                    "⚠ $missing permission${if (missing > 1) "s" else ""} pending — Jarvis is limited until granted.",
                    fontSize = 13.sp
                )
                Spacer(Modifier.height(6.dp))
                OutlinedButton(onClick = { nav.navigate("permissions") }) {
                    Text(stringResource(R.string.nav_permissions))
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        notices.take(3).forEach { note ->
            Text(
                note,
                color = JarvisCyan.copy(alpha = 0.8f),
                fontSize = 11.sp,
                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                textAlign = TextAlign.Center
            )
        }

        Spacer(Modifier.height(10.dp))
        Text(
            "wifi on · torch on · call mom · play kesariya on youtube · set alarm at 7 am · what's my battery",
            color = JarvisTextDim,
            fontSize = 11.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

package com.jarvis.assistant.ui.screen

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jarvis.assistant.JarvisApp
import com.jarvis.assistant.R
import com.jarvis.assistant.ui.JarvisCyan
import com.jarvis.assistant.ui.JarvisGold
import com.jarvis.assistant.ui.JarvisPanel
import com.jarvis.assistant.ui.JarvisRed
import com.jarvis.assistant.ui.JarvisTextDim
import com.jarvis.assistant.ui.JarvisViewModel
import com.jarvis.assistant.ui.components.Chip
import com.jarvis.assistant.ui.components.PanelCard
import com.jarvis.assistant.ui.components.ScanLine
import com.jarvis.assistant.ui.components.SectionTitle

/** Everything Jarvis remembers about the user — fully editable-looking, one-tap wipe. */
@Composable
fun MemoryScreen(vm: JarvisViewModel) {
    val snap by JarvisApp.container.memory.snapshot.collectAsStateWithLifecycle()
    val history by vm.transcript.collectAsStateWithLifecycle()
    var confirmForget by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            "Contextual memory — on-device only. Jarvis folds this into every prompt so it knows your world.",
            color = JarvisTextDim,
            fontSize = 11.5.sp
        )
        ScanLine()

        SectionTitle(stringResource(R.string.mem_facts))
        PanelCard {
            if (snap.facts.isEmpty()) {
                Text("Nothing yet — say things like \"my favourite colour is blue\" or \"remember my Wi-Fi password is x\".", color = JarvisTextDim, fontSize = 12.sp)
            }
            snap.facts.forEach { (k, v) ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(k, color = JarvisCyan, fontSize = 12.5.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1f))
                    Text(v, color = MaterialTheme.colorScheme.onSurface, fontSize = 12.5.sp, modifier = Modifier.weight(1.4f))
                }
            }
        }

        SectionTitle(stringResource(R.string.mem_contacts))
        PanelCard(accent = JarvisGold) {
            if (snap.contacts.isEmpty()) {
                Text("Aliases learned from voice — \"call mom\" resolves to the saved number.", color = JarvisTextDim, fontSize = 12.sp)
            }
            snap.contacts.forEach { (alias, name) ->
                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip(alias, JarvisGold)
                    Text("→  $name", fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurface)
                }
            }
        }

        if (snap.likes.isNotEmpty()) {
            SectionTitle("Likes")
            PanelCard(accent = com.jarvis.assistant.ui.JarvisMint) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    snap.likes.take(12).forEach { Chip(it, com.jarvis.assistant.ui.JarvisMint) }
                }
            }
        }

        SectionTitle("Conversation (recent)")
        PanelCard(accent = JarvisRed) {
            Text("${history.size} turns shown · stored on device for context windows", color = JarvisTextDim, fontSize = 11.sp)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { vm.clearConversation() }) {
                    Text(stringResource(R.string.settings_clear_chat), color = JarvisCyan, fontSize = 12.sp)
                }
                OutlinedButton(onClick = { confirmForget = true }) {
                    Text(stringResource(R.string.danger_zone), color = JarvisRed, fontSize = 12.sp)
                }
            }
        }

        if (confirmForget) {
            AlertDialog(
                onDismissRequest = { confirmForget = false },
                containerColor = JarvisPanel,
                title = { Text("Forget everything?") },
                text = { Text("All learned facts, contact aliases and preferences will be erased. This cannot be undone.") },
                confirmButton = {
                    TextButton(onClick = { vm.forgetEverything(); confirmForget = false }) {
                        Text("Forget all", color = JarvisRed)
                    }
                },
                dismissButton = { TextButton(onClick = { confirmForget = false }) { Text("Keep") } }
            )
        }
        Spacer(Modifier.height(18.dp))
    }
}

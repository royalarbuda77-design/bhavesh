package com.jarvis.assistant.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Mic
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jarvis.assistant.R
import com.jarvis.assistant.ui.JarvisCyan
import com.jarvis.assistant.ui.JarvisCyanDim
import com.jarvis.assistant.ui.JarvisPanel
import com.jarvis.assistant.ui.JarvisTextDim
import com.jarvis.assistant.ui.UiTurn
import com.jarvis.assistant.ui.JarvisViewModel

@Composable
fun ChatScreen(vm: JarvisViewModel) {
    val transcript by vm.transcript.collectAsStateWithLifecycle()
    val partial by vm.partial.collectAsStateWithLifecycle()
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(transcript.size, partial) {
        if (transcript.isNotEmpty()) listState.animateScrollToItem(transcript.size)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (transcript.isEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                        Text(
                            stringResource(R.string.chat_placeholder),
                            color = JarvisTextDim,
                            fontSize = 13.sp
                        )
                    }
                }
            }
            items(transcript.takeLast(80)) { turn -> Bubble(turn) }
            if (partial.isNotBlank()) {
                item {
                    Text(
                        "… $partial",
                        color = JarvisCyan.copy(alpha = 0.75f),
                        fontSize = 13.sp,
                        modifier = Modifier.padding(start = 10.dp)
                    )
                }
            }
            item { Spacer(Modifier.height(6.dp)) }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                placeholder = { Text(stringResource(R.string.chat_type_hint), fontSize = 13.sp) },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = JarvisCyan,
                    unfocusedBorderColor = JarvisCyanDim.copy(alpha = 0.5f),
                    cursorColor = JarvisCyan
                ),
                maxLines = 4,
                textStyle = MaterialTheme.typography.bodyLarge
            )
            FilledIconButton(
                onClick = { vm.sendTyped(input); input = "" },
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = JarvisCyan)
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.chat_send), tint = JarvisPanel)
            }
            FilledIconButton(
                onClick = { vm.talkNow() },
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = JarvisCyanDim)
            ) {
                Icon(Icons.Default.Mic, contentDescription = null, tint = androidx.compose.ui.graphics.Color.White)
            }
        }
    }
}

@Composable
private fun Bubble(turn: UiTurn) {
    val mine = turn.fromUser
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 320.dp)
                .background(
                    if (mine) JarvisCyan.copy(alpha = 0.16f) else JarvisPanel,
                    RoundedCornerShape(
                        topStart = 16.dp, topEnd = 16.dp,
                        bottomStart = if (mine) 16.dp else 4.dp,
                        bottomEnd = if (mine) 4.dp else 16.dp
                    )
                )
                .padding(12.dp)
        ) {
            Column {
                if (!mine) {
                    Text("JARVIS", color = JarvisCyan, fontSize = 9.sp, letterSpacing = 2.sp)
                    Spacer(Modifier.height(3.dp))
                }
                Text(
                    turn.text,
                    color = if (mine) androidx.compose.ui.graphics.Color.White else MaterialTheme.colorScheme.onSurface,
                    fontSize = 14.sp
                )
            }
        }
    }
}

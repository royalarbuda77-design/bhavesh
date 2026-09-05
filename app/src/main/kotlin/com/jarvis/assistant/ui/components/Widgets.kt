package com.jarvis.assistant.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.assistant.ui.JarvisCyan
import com.jarvis.assistant.ui.JarvisGold
import com.jarvis.assistant.ui.JarvisMint
import com.jarvis.assistant.ui.JarvisPanel
import com.jarvis.assistant.ui.JarvisRed
import com.jarvis.assistant.ui.JarvisTextDim

/** Panel card with a thin cyan sweep — the "HUD frame" look. */
@Composable
fun PanelCard(
    modifier: Modifier = Modifier,
    accent: Color = JarvisCyan,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = JarvisPanel.copy(alpha = 0.85f)),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            Brush.linearGradient(listOf(accent.copy(alpha = 0.55f), Color.Transparent, accent.copy(alpha = 0.25f)))
        )
    ) {
        Column(modifier = Modifier.padding(16.dp), content = content)
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 3.sp, color = JarvisCyan),
        modifier = modifier.padding(vertical = 8.dp)
    )
}

@Composable
fun SwitchRow(
    title: String,
    subtitle: String = "",
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle.isNotBlank()) {
                Text(subtitle, color = JarvisTextDim, fontSize = 12.sp, style = MaterialTheme.typography.bodyMedium)
            }
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
fun ValueRow(title: String, value: String, onClick: (() -> Unit)? = null) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        if (onClick != null) {
            TextButton(onClick = onClick) {
                Text(value, color = JarvisCyan, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
            }
        } else {
            Text(value, color = JarvisCyan, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
        }
    }
}

@Composable
fun SegmentedChoice(
    label: String,
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(label, color = JarvisTextDim, fontSize = 12.sp)
        Spacer(Modifier.height(6.dp))
        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            options.forEachIndexed { idx, opt ->
                val selected = idx == selectedIndex
                if (selected) {
                    androidx.compose.material3.Button(onClick = { onSelect(idx) }) { Text(opt, fontSize = 12.sp) }
                } else {
                    OutlinedButton(onClick = { onSelect(idx) }) { Text(opt, fontSize = 12.sp) }
                }
            }
        }
    }
}

@Composable
fun StatusDot(ok: Boolean) {
    Icon(
        imageVector = if (ok) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
        contentDescription = null,
        tint = if (ok) JarvisMint else JarvisRed.copy(alpha = 0.8f),
        modifier = Modifier.size(18.dp)
    )
}

/** Thin animated scanline used behind headers — pure cyber flavour. */
@Composable
fun ScanLine(modifier: Modifier = Modifier, color: Color = JarvisCyan) {
    val t = rememberInfiniteTransition(label = "scan")
    val pos by t.animateFloat(0f, 1f, infiniteRepeatable(tween(2600, easing = LinearEasing), RepeatMode.Reverse), label = "p")
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(2.dp)
            .background(
                Brush.horizontalGradient(
                    listOf(Color.Transparent, color.copy(alpha = 0.9f), Color.Transparent),
                    startX = pos * 1200f - 600f
                )
            )
    )
}

@Composable
fun Chip(text: String, tint: Color = JarvisCyan, onClick: (() -> Unit)? = null) {
    val shape = RoundedCornerShape(50)
    val base = Modifier.background(tint.copy(alpha = 0.14f), shape)
    val clickMod = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier
    Box(modifier = base.then(clickMod).padding(horizontal = 12.dp, vertical = 6.dp)) {
        Text(text, color = tint, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
    }
}

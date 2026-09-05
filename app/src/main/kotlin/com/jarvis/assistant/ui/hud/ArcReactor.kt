package com.jarvis.assistant.ui.hud

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import com.jarvis.assistant.core.state.AssistantState
import com.jarvis.assistant.ui.JarvisBlack
import com.jarvis.assistant.ui.JarvisCyan
import com.jarvis.assistant.ui.JarvisCyanBright
import com.jarvis.assistant.ui.JarvisCyanDim
import com.jarvis.assistant.ui.JarvisGold
import com.jarvis.assistant.ui.JarvisMint
import com.jarvis.assistant.ui.JarvisRed
import com.jarvis.assistant.ui.JarvisViolet
import kotlin.math.cos
import kotlin.math.sin

interface HudControls {
    fun onTapTalk()
    fun onLongPressOpen()
    fun onDoubleTapClose()
    fun onDragBy(dx: Float, dy: Float) {}
    fun onDragEnd() {}
}

private fun accent(state: AssistantState): Color = when (state) {
    AssistantState.IDLE -> JarvisCyan
    AssistantState.LISTENING -> JarvisCyanBright
    AssistantState.THINKING -> JarvisGold
    AssistantState.SPEAKING -> JarvisMint
    AssistantState.SLEEPING -> JarvisCyanDim.copy(alpha = 0.55f)
    AssistantState.ERROR -> JarvisRed
}

/**
 * Pure-canvas dynamic 3D-style arc reactor: counter-rotating segmented rings,
 * energy core that breathes with a pulse, and a radial waveform driven by live
 * microphone amplitude. No sprites, no shaders — buttery at 60 fps.
 */
@Composable
fun ArcReactor(
    state: AssistantState,
    level: Float = 0f,
    modifier: Modifier = Modifier,
    detailed: Boolean = true
) {
    val transition = rememberInfiniteTransition(label = "reactor")
    val spin by transition.animateFloat(
        0f, 360f,
        infiniteRepeatable(tween(9000, easing = LinearEasing), RepeatMode.Restart),
        label = "spin"
    )
    val spinBack by transition.animateFloat(
        360f, 0f,
        infiniteRepeatable(tween(13_000, easing = LinearEasing), RepeatMode.Restart),
        label = "spinback"
    )
    val breathe by transition.animateFloat(
        0.92f, 1.08f,
        infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Reverse),
        label = "breathe"
    )

    val accent = accent(state)
    val wave = remember { LevelRing(28) }
    wave.push(level)

    Canvas(modifier = modifier) {
        val cx = size.width / 2f
        val cy = size.height / 2f
        val maxR = minOf(cx, cy)
        val reactive = 1f + level * 0.55f
        val active = state != AssistantState.SLEEPING

        // ambient glow
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    accent.copy(alpha = if (active) 0.30f else 0.10f),
                    Color.Transparent
                ),
                center = Offset(cx, cy),
                radius = maxR * 1.9f
            ),
            radius = maxR * 1.9f,
            center = Offset(cx, cy)
        )

        // outer static ring
        drawCircle(
            color = accent.copy(alpha = 0.9f),
            radius = maxR * 0.94f,
            center = Offset(cx, cy),
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = maxR * 0.035f)
        )
        drawCircle(
            color = Color.White.copy(alpha = 0.08f),
            radius = maxR * 0.995f,
            center = Offset(cx, cy),
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = maxR * 0.012f)
        )

        if (detailed) {
            // 6 segmented arcs, clockwise
            for (i in 0 until 6) {
                val start = spin + i * 60f
                drawArc(
                    color = accent.copy(alpha = 0.85f),
                    startAngle = start,
                    sweepAngle = 38f,
                    useCenter = false,
                    topLeft = Offset(cx - maxR * 0.80f, cy - maxR * 0.80f),
                    size = androidx.compose.ui.geometry.Size(maxR * 1.6f, maxR * 1.6f),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = maxR * 0.075f, cap = androidx.compose.ui.graphics.StrokeCap.Round)
                )
            }
            // 4 counter arcs
            for (i in 0 until 4) {
                val start = spinBack + i * 90f
                drawArc(
                    color = JarvisCyanBright.copy(alpha = 0.55f),
                    startAngle = start,
                    sweepAngle = 55f,
                    useCenter = false,
                    topLeft = Offset(cx - maxR * 0.62f, cy - maxR * 0.62f),
                    size = androidx.compose.ui.geometry.Size(maxR * 1.24f, maxR * 1.24f),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = maxR * 0.045f, cap = androidx.compose.ui.graphics.StrokeCap.Round)
                )
            }

            // radial waveform ring (mic driven)
            val n = wave.size
            for (i in 0 until n) {
                val v = wave.at(i)
                val ang = (i.toFloat() / n) * 2f * PI_F
                val r0 = maxR * 0.50f
                val r1 = r0 + maxR * (0.10f + v * 0.42f)
                drawLine(
                    color = lerpColor(accent, JarvisCyanBright, v),
                    start = Offset(cx + cos(ang) * r0, cy + sin(ang) * r0),
                    end = Offset(cx + cos(ang) * r1, cy + sin(ang) * r1),
                    strokeWidth = maxR * 0.045f,
                    cap = androidx.compose.ui.graphics.StrokeCap.Round
                )
            }
        }

        // core: white-hot, reactive
        val coreR = maxR * (0.34f + 0.05f * breathe) * (if (state == AssistantState.SLEEPING) 0.8f else reactive)
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color.White, accent, accent.copy(alpha = 0.15f)),
                center = Offset(cx, cy),
                radius = coreR * 1.6f
            ),
            radius = coreR * 1.6f,
            center = Offset(cx, cy)
        )
        drawCircle(
            color = JarvisBlack.copy(alpha = 0.65f),
            radius = coreR * 0.52f,
            center = Offset(cx, cy)
        )
        drawCircle(
            color = Color.White.copy(alpha = 0.95f),
            radius = coreR * 0.22f * breathe,
            center = Offset(cx, cy)
        )

        if (state == AssistantState.LISTENING) {
            // orbiting "satellite" pip
            val a = spin * 3f
            drawCircle(
                color = JarvisCyanBright,
                radius = maxR * 0.05f,
                center = Offset(cx + cos(a.toRadians()) * maxR * 0.88f, cy + sin(a.toRadians()) * maxR * 0.88f)
            )
        }
        if (state == AssistantState.THINKING) {
            for (i in 0 until 3) {
                val a = (spin * 4f + i * 120f).toRadians()
                drawCircle(
                    color = JarvisGold,
                    radius = maxR * 0.035f,
                    center = Offset(cx + cos(a) * maxR * 0.72f, cy + sin(a) * maxR * 0.72f)
                )
            }
        }
        if (state == AssistantState.SPEAKING) {
            for (k in 1..3) {
                val rr = maxR * (0.95f + 0.10f * k) * breathe
                drawCircle(
                    color = JarvisMint.copy(alpha = 0.20f / k),
                    radius = rr,
                    center = Offset(cx, cy),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = maxR * 0.012f)
                )
            }
        }
    }
}

private fun Float.toRadians(): Float = this * PI_F / 180f
private const val PI_F = 3.14159265358979323846f

private fun lerpColor(a: Color, b: Color, t: Float): Color = Color(
    red = a.red + (b.red - a.red) * t,
    green = a.green + (b.green - a.green) * t,
    blue = a.blue + (b.blue - a.blue) * t,
    alpha = a.alpha + (b.alpha - a.alpha) * t
)

/** fixed-size circular buffer of recent mic levels (one per HUD instance) */
private class LevelRing(private val n: Int) {
    private val buf = FloatArray(n)
    private var idx = 0
    val size get() = n

    fun push(v: Float) {
        val smoothed = if (idx == 0) v else (buf[last()] * 0.55f + v * 0.45f)
        buf[idx] = smoothed
        idx = (idx + 1) % n
    }

    private fun last(): Int = (idx - 1 + n) % n
    fun at(i: Int): Float = buf[i % n]
}

/** Standalone bubble used by the overlay service. */
@Composable
fun HudBubble(controls: HudControls) {
    var state by remember { androidx.compose.runtime.mutableStateOf(AssistantState.IDLE) }
    var level by remember { mutableFloatStateOf(0f) }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        launch {
            com.jarvis.assistant.core.state.JarvisBus.latestState.collect { state = it }
        }
        launch {
            com.jarvis.assistant.core.state.JarvisLevels.amplitude.collect { level = it }
        }
    }

    Box(
        modifier = Modifier
            .size(124.dp)
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragEnd = controls::onDragEnd,
                    onDragCancel = controls::onDragEnd
                ) { change, drag ->
                    change.consume()
                    controls.onDragBy(drag.x, drag.y)
                }
            }
            .shadow(14.dp, RoundedCornerShape(50%), ambientColor = JarvisViolet, spotColor = JarvisCyan)
            .clip(CircleShape)
            .background(JarvisBlack.copy(alpha = 0.72f))
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = { controls.onTapTalk() },
                    onLongPress = { controls.onLongPressOpen() },
                    onDoubleTap = { controls.onDoubleTapClose() }
                )
            }
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxSize().padding(10.dp)
        ) {
            ArcReactor(state = state, level = level, modifier = Modifier.size(96.dp), detailed = false)
            Text(
                text = when (state) {
                    AssistantState.LISTENING -> "LISTENING"
                    AssistantState.THINKING -> "ANALYSING"
                    AssistantState.SPEAKING -> "REPLYING"
                    AssistantState.SLEEPING -> "SLEEPING"
                    AssistantState.ERROR -> "HEALING…"
                    else -> "STANDBY"
                },
                color = JarvisCyanBright,
                fontSize = 9.sp,
                fontFamily = FontFamily.Monospace,
                textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )
        }
    }
}

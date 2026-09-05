package com.jarvis.assistant.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// ── JARVIS palette — deep space navy + arc-reactor cyan + reactor gold ──────
val JarvisBlack = Color(0xFF02090E)
val JarvisDeep = Color(0xFF06121C)
val JarvisPanel = Color(0xFF0A1B28)
val JarvisCyan = Color(0xFF54E6FF)
val JarvisCyanBright = Color(0xFFA5F3FF)
val JarvisCyanDim = Color(0xFF0AA8C9)
val JarvisGold = Color(0xFFFFD166)
val JarvisMint = Color(0xFF7CFFCB)
val JarvisRed = Color(0xFFFF6B6B)
val JarvisViolet = Color(0xFFB39DFF)
val JarvisTextDim = Color(0xFF7FA8BC)

private val scheme = darkColorScheme(
    primary = JarvisCyan,
    onPrimary = JarvisBlack,
    secondary = JarvisGold,
    onSecondary = JarvisBlack,
    tertiary = JarvisMint,
    background = JarvisBlack,
    onBackground = Color(0xFFE6F6FF),
    surface = JarvisDeep,
    onSurface = Color(0xFFE6F6FF),
    surfaceVariant = JarvisPanel,
    onSurfaceVariant = JarvisTextDim,
    error = JarvisRed,
    onError = JarvisBlack
)

val JarvisTypography = Typography(
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Bold,
        fontSize = 26.sp,
        letterSpacing = 6.sp
    ),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, letterSpacing = 1.sp),
    bodyLarge = TextStyle(fontSize = 15.sp),
    bodyMedium = TextStyle(fontSize = 13.sp),
    labelSmall = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 11.sp, letterSpacing = 1.2.sp)
)

@Composable
fun JarvisTheme(dark: Boolean = true, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (dark || isSystemInDarkTheme()) scheme else scheme,
        typography = JarvisTypography,
        content = content
    )
}

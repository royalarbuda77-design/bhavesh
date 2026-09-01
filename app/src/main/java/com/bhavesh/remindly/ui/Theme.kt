package com.bhavesh.remindly.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Lime = Color(0xFFC9F65B)
private val Ink = Color(0xFF161619)
private val Charcoal = Color(0xFF232327)
private val Slate = Color(0xFF94949E)
private val DarkText = Color(0xFFF5F5F0)
private val LightSurface = Color(0xFFF6F6F2)

private val DarkScheme = darkColorScheme(
    primary = Lime,
    onPrimary = Ink,
    secondary = Color(0xFFA9B4FF),
    onSecondary = Ink,
    background = Color(0xFF101012),
    onBackground = DarkText,
    surface = Color(0xFF1B1B1F),
    onSurface = DarkText,
    surfaceVariant = Charcoal,
    onSurfaceVariant = Color(0xFFB5B5BD),
    outline = Color(0xFF3A3A40),
    error = Color(0xFFFF8A80)
)

private val LightScheme = lightColorScheme(
    primary = Color(0xFF526D00),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE3F9A4),
    onPrimaryContainer = Color(0xFF1B2600),
    secondary = Color(0xFF5564B4),
    onSecondary = Color.White,
    background = LightSurface,
    onBackground = Color(0xFF1C1C20),
    surface = Color.White,
    onSurface = Color(0xFF1C1C20),
    surfaceVariant = Color(0xFFECECE8),
    onSurfaceVariant = Color(0xFF5E5E66),
    outline = Color(0xFFD6D6D0),
    error = Color(0xFFB3261E)
)

@Composable
fun RemindlyTheme(forceDark: Boolean? = null, content: @Composable () -> Unit) {
    val dark = forceDark ?: isSystemInDarkTheme()
    MaterialTheme(colorScheme = if (dark) DarkScheme else LightScheme, content = content)
}

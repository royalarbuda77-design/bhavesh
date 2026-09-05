package com.jarvis.assistant

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.jarvis.assistant.core.state.JarvisBus
import com.jarvis.assistant.core.util.PermissionRequests
import com.jarvis.assistant.service.JarvisService
import com.jarvis.assistant.ui.JarvisBlack
import com.jarvis.assistant.ui.JarvisCyan
import com.jarvis.assistant.ui.JarvisTheme
import com.jarvis.assistant.ui.JarvisViewModel
import com.jarvis.assistant.ui.screen.ChatScreen
import com.jarvis.assistant.ui.screen.CommandsScreen
import com.jarvis.assistant.ui.screen.DiagnosticsScreen
import com.jarvis.assistant.ui.screen.HomeScreen
import com.jarvis.assistant.ui.screen.MemoryScreen
import com.jarvis.assistant.ui.screen.PermissionsScreen
import com.jarvis.assistant.ui.screen.SettingsScreen
import kotlinx.coroutines.launch

/**
 * Single-activity Compose shell. Bottom nav mirrors the module map:
 * Home(HUD) · Chat · Commands · Memory · Settings · Permissions · Diagnostics
 */
class MainActivity : ComponentActivity() {

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            // results are re-read from PermissionFinder on resume
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        lifecycleScope.launch {
            PermissionRequests.pending.collect { perms ->
                runCatching { permissionLauncher.launch(perps) }
            }
        }

        setContent {
            JarvisTheme {
                JarvisShell(savedInstanceState?.getBoolean(EXTRA_OPEN_SETTINGS) == true)
            }
        }

        // Arm the assistant while the app is foregrounded (Android 14+
        // microphone-FGS from background is restricted; boot path has its
        // own guarded attempt).
        maybeStartService()
    }

    override fun onResume() {
        super.onResume()
        (androidx.lifecycle.ViewModelProvider(this)[JarvisViewModel::class.java] as? JarvisViewModel)
            ?.refreshPermissions()
    }

    private fun maybeStartService() {
        runCatching {
            val cfg = JarvisApp.container.settings.current()
            if (!JarvisService.isRunning && !com.jarvis.assistant.core.healing.SelfHealing.inSafeMode()) {
                JarvisService.send(this, JarvisService.ACTION_START)
            }
            if (cfg.overlayEnabled) com.jarvis.assistant.overlay.JarvisOverlayService.start(this)
        }
    }

    companion object {
        const val EXTRA_OPEN_SETTINGS = "open_settings"
    }
}

private data class JarvisDest(val route: String, val labelRes: Int, val icon: ImageVector)

@Composable
private fun JarvisShell(startOnSettings: Boolean) {
    val nav = rememberNavController()
    val items = listOf(
        JarvisDest("home", R.string.nav_home, Icons.Default.GraphicEq),
        JarvisDest("chat", R.string.nav_chat, Icons.Default.Chat),
        JarvisDest("commands", R.string.nav_commands, Icons.Default.Home),
        JarvisDest("memory", R.string.nav_memory, Icons.Default.Psychology),
        JarvisDest("settings", R.string.nav_settings, Icons.Default.Tune),
        JarvisDest("permissions", R.string.nav_permissions, Icons.Default.Shield),
        JarvisDest("diagnostics", R.string.nav_diagnostics, Icons.Default.Terminal)
    )
    val context = LocalContext.current
    val vm: JarvisViewModel = viewModel()

    if (startOnSettings) {
        LaunchedEffectCompat { nav.navigate("settings") }
    }

    Scaffold(
        containerColor = JarvisBlack,
        bottomBar = {
            NavigationBar(containerColor = JarvisBlack) {
                items.forEach { dest ->
                    val selected = nav.currentDestination?.route == dest.route
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            nav.navigate(dest.route) {
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(dest.icon, contentDescription = null) },
                        label = { Text(stringResource(dest.labelRes), fontSize = 10.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = JarvisCyan,
                            selectedTextColor = JarvisCyan,
                            indicatorColor = JarvisCyan.copy(alpha = 0.12f)
                        )
                    )
                }
            }
        }
    ) { padding ->
        androidx.compose.foundation.layout.Box(Modifier.padding(padding)) {
            NavHost(
                navController = nav,
                startDestination = if (startOnSettings) "settings" else "home"
            ) {
                composable("home") { HomeScreen(vm, nav) }
                composable("chat") { ChatScreen(vm) }
                composable("commands") { CommandsScreen() }
                composable("memory") { MemoryScreen(vm) }
                composable("settings") { SettingsScreen(vm) }
                composable("permissions") { PermissionsScreen(vm, context as android.app.Activity) }
                composable("diagnostics") { DiagnosticsScreen(vm) }
            }
        }
    }
}

/** tiny wrapper so imports stay tidy */
@Composable
private fun LaunchedEffectCompat(block: suspend () -> Unit) {
    androidx.compose.runtime.LaunchedEffect(Unit) { block() }
}

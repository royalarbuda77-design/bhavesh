package com.bhavesh.remindly

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.app.ActivityCompat
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bhavesh.remindly.data.ReminderEntity
import com.bhavesh.remindly.ui.AddReminderScreen
import com.bhavesh.remindly.ui.AppViewModel
import com.bhavesh.remindly.ui.BottomNavBar
import com.bhavesh.remindly.ui.CalendarScreen
import com.bhavesh.remindly.ui.CompletedScreen
import com.bhavesh.remindly.ui.HomeScreen
import com.bhavesh.remindly.ui.RemindlyTheme
import com.bhavesh.remindly.ui.ReminderDetailScreen
import com.bhavesh.remindly.ui.SearchScreen
import com.bhavesh.remindly.ui.SettingsScreen
import com.bhavesh.remindly.ui.UpcomingScreen
import com.bhavesh.remindly.ui.ThemeChoice
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    private val viewModel by viewModels<AppViewModel>()
    private var permissionTick by mutableIntStateOf(0)
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { viewModel.rescheduleAll() }
    private val exportDocument = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> uri?.let(viewModel::exportTo) }
    private val importDocument = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(viewModel::importFrom) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(this, false)
        val incomingId = intent.getLongExtra(com.bhavesh.remindly.alarm.ReminderScheduler.EXTRA_REMINDER_ID, -1L)
        setContent { RemindlyRoot(viewModel, incomingId.takeIf { it > 0 }, permissionTick, ::requestNotifications, ::requestExactAlarms, ::openBatterySettings, ::exportReminders, ::importReminders) }
    }

    override fun onResume() {
        super.onResume()
        permissionTick++
        viewModel.rescheduleAll()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val id = intent.getLongExtra(com.bhavesh.remindly.alarm.ReminderScheduler.EXTRA_REMINDER_ID, -1L)
        if (id > 0) recreate()
    }

    private fun requestNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun requestExactAlarms() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching { startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))) }
        }
    }

    private fun openBatterySettings() {
        runCatching { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
    }

    private fun exportReminders() { exportDocument.launch("remindly-backup.json") }
    private fun importReminders() { importDocument.launch(arrayOf("application/json", "text/plain")) }
}

enum class AppScreen { HOME, CALENDAR, UPCOMING, COMPLETED, SEARCH, ADD, DETAIL, SETTINGS }

@Composable
private fun RemindlyRoot(
    viewModel: AppViewModel,
    incomingId: Long?,
    permissionTick: Int,
    requestNotifications: () -> Unit,
    requestExactAlarms: () -> Unit,
    openBatterySettings: () -> Unit,
    exportReminders: () -> Unit,
    importReminders: () -> Unit
) {
    val reminders by viewModel.reminders.collectAsStateWithLifecycle()
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val now by viewModel.now.collectAsStateWithLifecycle()
    var screenName by rememberSaveable { mutableStateOf(if (incomingId != null) AppScreen.DETAIL.name else AppScreen.HOME.name) }
    var selectedId by rememberSaveable { mutableStateOf(incomingId ?: -1L) }
    var addDateEpoch by rememberSaveable { mutableStateOf(LocalDate.now().toEpochDay()) }
    val screen = AppScreen.valueOf(screenName)
    val snackbar = remember { SnackbarHostState() }
    val detail by if (selectedId > 0) viewModel.reminder(selectedId).collectAsStateWithLifecycle(null) else mutableStateOf<ReminderEntity?>(null)
    val isDark = when (settings.theme) { ThemeChoice.DARK -> true; ThemeChoice.LIGHT -> false; ThemeChoice.SYSTEM -> null }
    BackHandler(enabled = screen != AppScreen.HOME) {
        screenName = when (screen) {
            AppScreen.ADD -> if (selectedId > 0) AppScreen.DETAIL.name else AppScreen.HOME.name
            AppScreen.DETAIL, AppScreen.SEARCH, AppScreen.COMPLETED -> AppScreen.HOME.name
            else -> AppScreen.HOME.name
        }
    }

    RemindlyTheme(isDark) {
        Scaffold(
            snackbarHost = { SnackbarHost(snackbar) },
            bottomBar = { if (screen in listOf(AppScreen.HOME, AppScreen.CALENDAR, AppScreen.UPCOMING, AppScreen.SETTINGS)) BottomNavBar(screen, { screenName = it.name }) }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                ScreenContent(
                    screen = screen, reminders = reminders, detail = detail, now = now, settings = settings,
                    addDate = LocalDate.ofEpochDay(addDateEpoch), viewModel = viewModel,
                    onNavigate = { screenName = it.name }, onSelect = { selectedId = it; screenName = AppScreen.DETAIL.name },
                    onAdd = { addDateEpoch = it.toEpochDay(); selectedId = -1; screenName = AppScreen.ADD.name },
                    onEdit = { screenName = AppScreen.ADD.name },
                    onSaved = { id -> selectedId = id; screenName = AppScreen.DETAIL.name },
                    requestNotifications = requestNotifications, requestExactAlarms = requestExactAlarms, openBatterySettings = openBatterySettings,
                    exportReminders = exportReminders, importReminders = importReminders, snackbar = snackbar
                )
            }
        }
    }
}

@Composable
private fun ScreenContent(
    screen: AppScreen,
    reminders: List<ReminderEntity>,
    detail: ReminderEntity?,
    now: java.time.Instant,
    settings: com.bhavesh.remindly.ui.SettingsState,
    addDate: LocalDate,
    viewModel: AppViewModel,
    onNavigate: (AppScreen) -> Unit,
    onSelect: (Long) -> Unit,
    onAdd: (LocalDate) -> Unit,
    onEdit: () -> Unit,
    onSaved: (Long) -> Unit,
    requestNotifications: () -> Unit,
    requestExactAlarms: () -> Unit,
    openBatterySettings: () -> Unit,
    exportReminders: () -> Unit,
    importReminders: () -> Unit,
    snackbar: SnackbarHostState
) {
    when (screen) {
        AppScreen.HOME -> HomeScreen(reminders, now, { onAdd(LocalDate.now()) }, { onNavigate(AppScreen.CALENDAR) }, { onNavigate(AppScreen.SEARCH) }, { onNavigate(AppScreen.SETTINGS) }, { onNavigate(AppScreen.UPCOMING) }, { onNavigate(AppScreen.COMPLETED) }, onSelect, viewModel::complete)
        AppScreen.CALENDAR -> CalendarScreen(reminders, settings.firstDay, null, onAdd, onSelect)
        AppScreen.UPCOMING -> UpcomingScreen(reminders, { onNavigate(AppScreen.HOME) }, onSelect, viewModel::complete)
        AppScreen.COMPLETED -> CompletedScreen(reminders, now, { onNavigate(AppScreen.HOME) }, onSelect)
        AppScreen.SEARCH -> SearchScreen(reminders, { onNavigate(AppScreen.HOME) }, onSelect)
        AppScreen.ADD -> AddReminderScreen(detail, addDate, { onNavigate(if (detail != null) AppScreen.DETAIL else AppScreen.HOME) }, { draft -> viewModel.save(draft, detail, onSaved) })
        AppScreen.DETAIL -> if (detail == null) onNavigate(AppScreen.HOME) else ReminderDetailScreen(detail, { onNavigate(AppScreen.HOME) }, onEdit, { viewModel.duplicate(detail, onSaved) }, { viewModel.complete(detail); onNavigate(AppScreen.HOME) }, { viewModel.delete(detail) { onNavigate(AppScreen.HOME) } })
        AppScreen.SETTINGS -> SettingsScreen(settings, viewModel.exactAlarmsAllowed(), viewModel.notificationsAllowed(), { onNavigate(AppScreen.HOME) }, viewModel::updateTheme, viewModel::updateFirstDay, viewModel::updateVibration, requestExactAlarms, requestNotifications, openBatterySettings, exportReminders, importReminders, viewModel::clearCompleted)
    }
    // The snackbar host is owned by the root so save/delete actions remain lifecycle-safe.
}

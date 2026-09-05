package com.jarvis.assistant.ui.screen

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jarvis.assistant.R
import com.jarvis.assistant.automation.perms.Capability
import com.jarvis.assistant.automation.perms.PermissionFinder
import com.jarvis.assistant.ui.JarvisCyan
import com.jarvis.assistant.ui.JarvisMint
import com.jarvis.assistant.ui.JarvisPanel
import com.jarvis.assistant.ui.JarvisTextDim
import com.jarvis.assistant.ui.JarvisViewModel
import com.jarvis.assistant.ui.PermRow
import com.jarvis.assistant.ui.components.Chip
import com.jarvis.assistant.ui.components.PanelCard
import com.jarvis.assistant.ui.components.ScanLine
import com.jarvis.assistant.ui.components.StatusDot

/**
 * One-shot capability wizard. Runtime permissions use the standard dialog;
 * special-access capabilities (notification listener, accessibility, overlay,
 * battery, DND, WRITE_SETTINGS) deep-link to the right system page — and the
 * status re-checks every time the user comes back.
 */
@Composable
fun PermissionsScreen(vm: JarvisViewModel, activity: Activity) {
    val perms by vm.permissions.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        vm.refreshPermissions()
    }
    LaunchedEffect(Unit) { vm.refreshPermissions() }

    val runtimeGroup = Capability.entries.filter { PermissionFinder(context).runtimePermissionsFor(it).isNotEmpty() }
    val allRuntimeGranted = runtimeGroup.all { p -> perms.first { it.capability == p }.granted }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            stringResource(R.string.perm_welcome),
            style = MaterialTheme.typography.titleMedium,
            color = JarvisCyan
        )
        Text(
            stringResource(R.string.perm_welcome_body),
            color = JarvisTextDim,
            fontSize = 12.sp
        )
        ScanLine()

        if (!allRuntimeGranted) {
            Button(
                onClick = {
                    val pf = PermissionFinder(context)
                    val needed = runtimeGroup
                        .filter { !perms.first { row -> row.capability == it }.granted }
                        .flatMap { pf.runtimePermissionsFor(it).toList() }
                        .distinct()
                    if (needed.isNotEmpty()) launcher.launch(needed.toTypedArray())
                },
                colors = ButtonDefaults.buttonColors(containerColor = JarvisCyan, contentColor = JarvisPanel)
            ) {
                Text(stringResource(R.string.btn_grant_runtime))
            }
        }

        perms.forEach { row ->
            PermissionRow(row, onGrant = {
                val cap = row.capability
                val status = PermissionFinder(context).status(cap)
                when {
                    status.granted -> vm.refreshPermissions()
                    status.manualIntent != null -> runCatching { context.startActivity(status.manualIntent) }
                    PermissionFinder(context).runtimePermissionsFor(cap).isNotEmpty() ->
                        launcher.launch(PermissionFinder(context).runtimePermissionsFor(cap))
                    else -> runCatching {
                        context.startActivity(
                            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                        )
                    }
                }
            })
        }

        Spacer(Modifier.height(6.dp))
        OutlinedButton(onClick = { vm.refreshPermissions() }, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.btn_recheck), color = JarvisCyan)
        }
        Text(
            stringResource(R.string.perm_note),
            color = JarvisTextDim,
            fontSize = 11.sp
        )
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun PermissionRow(row: PermRow, onGrant: () -> Unit) {
    val cap = row.capability
    PanelCard(accent = if (row.granted) JarvisMint else JarvisCyan.copy(alpha = 0.4f)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusDot(row.granted)
            Spacer(Modifier.height(0.dp))
            Column(Modifier.weight(1f)) {
                Text(cap.label, fontSize = 15.sp)
                Spacer(Modifier.height(2.dp))
                Text(row.why, color = JarvisTextDim, fontSize = 11.5.sp, lineHeight = 15.sp)
                if (!row.granted) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        if (row.isSystemPanel) "Opens a system settings page — flip the switch, then come back." else "Standard permission dialog.",
                        color = JarvisCyan.copy(alpha = 0.75f),
                        fontSize = 10.sp
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            if (row.granted) {
                Chip("ON", JarvisMint)
            } else {
                Button(
                    onClick = onGrant,
                    colors = ButtonDefaults.buttonColors(containerColor = JarvisCyan.copy(alpha = 0.2f), contentColor = JarvisCyan)
                ) { Text(stringResource(R.string.btn_grant)) }
            }
        }
    }
}

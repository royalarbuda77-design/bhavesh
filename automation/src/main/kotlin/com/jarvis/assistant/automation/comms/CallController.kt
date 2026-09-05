package com.jarvis.assistant.automation.comms

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.telecom.TelecomManager
import androidx.annotation.RequiresPermission
import com.jarvis.assistant.automation.I18n
import com.jarvis.assistant.automation.perms.PermissionFinder
import com.jarvis.assistant.automation.system.ExecOutcome
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.util.PermissionRequests
import com.jarvis.assistant.core.util.TextNorm

/**
 * Dialing. Full auto-dial requires CALL_PHONE; without it we open the dialer
 * pre-filled (ACTION_DIAL) — zero-permission and one tap from the call.
 */
class CallController(
    private val context: Context,
    private val resolver: ContactsResolver
) {

    suspend fun call(target: String?, number: String?, video: Boolean): ExecOutcome {
        val lang = TextNorm.detectLang(target ?: number ?: "call")

        val phone = normalizePhone(number)
            ?: target?.let { lookupPhone(it) }
            ?: return ExecOutcome(
                false,
                if (target.isNullOrBlank()) I18n.notFound(lang, "a contact name")
                else I18n.notFound(lang, "'$target' in your contacts") +
                    " — say the number, or save the contact first."
            )

        if (video) {
            // Video calls are in-app (WhatsApp/Duo/Meet) — open chat; one tap to call.
            val wa = openWhatsAppChat(phone)
            return ExecOutcome(
                wa,
                if (wa) "Opened WhatsApp chat — tap the video-call button."
                else "Couldn't open a video-calling app; dialer opened instead."
            ).let { if (it.ok) it else dial(phone) }
        }

        if (!hasCallPermission()) {
            PermissionRequests.request(Manifest.permission.CALL_PHONE)
            return dial(phone).let {
                ExecOutcome(
                    it.ok,
                    "Dialer opened for $phone. Grant me the CALL_PHONE permission and I'll dial hands-free next time."
                )
            }
        }
        return runCatching {
            val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$phone"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            ExecOutcome(true, "Calling $phone")
        }.getOrElse {
            JarvisLog.w("ACTION_CALL failed", it)
            dial(phone)
        }
    }

    /** End active call: telecom API needs Carrier role → politely impossible. */
    fun hangup(): ExecOutcome {
        val tm = runCatching { context.getSystemService(TelecomManager::class.java) }.getOrNull()
        val inCall = runCatching { tm?.isInCall == true }.getOrDefault(false)
        if (!inCall) return ExecOutcome(true, "No active call")
        return ExecOutcome(
            false,
            "Android only lets the dialer end calls — tapping the End button is needed."
        )
    }

    private fun hasCallPermission(): Boolean = runCatching {
        context.checkSelfPermission(Manifest.permission.CALL_PHONE) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
    }.getOrDefault(false)

    private fun dial(phone: String): ExecOutcome = runCatching {
        context.startActivity(
            Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        ExecOutcome(true, "Dialer opened for $phone")
    }.getOrElse {
        ExecOutcome(false, "Could not open the dialer")
    }

    private fun openWhatsAppChat(phone: String): Boolean = runCatching {
        val digits = phone.filter { it.isDigit() || it == '+' }
        val nat = if (digits.startsWith("+")) digits.drop(1) else digits
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$nat"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
    }.getOrDefault(false)

    private fun normalizePhone(n: String?): String? {
        val t = n?.filter { c -> c.isDigit() || c == '+' }?.trim()
        return t?.takeIf { it.length >= 7 }
    }

    private fun lookupPhone(name: String): String? = runCatching {
        if (!PermissionFinder(context).status(com.jarvis.assistant.automation.perms.Capability.CONTACTS).granted) {
            PermissionRequests.request(Manifest.permission.READ_CONTACTS)
            return null
        }
        resolver.find(name, 1).firstOrNull()?.number?.let { normalizePhone(it) }
    }.getOrNull()
}

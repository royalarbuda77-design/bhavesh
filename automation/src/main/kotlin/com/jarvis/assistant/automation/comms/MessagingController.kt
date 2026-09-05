package com.jarvis.assistant.automation.comms

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import com.jarvis.assistant.automation.I18n
import com.jarvis.assistant.automation.perms.Capability
import com.jarvis.assistant.automation.perms.PermissionFinder
import com.jarvis.assistant.automation.system.ExecOutcome
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.util.PermissionRequests
import com.jarvis.assistant.core.util.TextNorm

/**
 * WhatsApp / SMS / E-mail.
 *
 *  • WhatsApp text: official `wa.me` deep-link opens the chat with the draft
 *    already typed → one tap sends. (Meta exposes no send-verb to 3rd apps;
 *    silently sending via accessibility would violate their ToS — we stay
 *    commercial-safe by design.)
 *  • Voice message: opens the chat and instructs to hold the mic.
 *  • SMS: true silent send via SmsManager when SEND_SMS is granted.
 *  • E-mail: hands a filled draft (subject/body/recipient) to Gmail/Mail.
 */
class MessagingController(
    private val context: Context,
    private val resolver: ContactsResolver
) {

    // ── WhatsApp ─────────────────────────────────────────────────────────────
    fun whatsapp(target: String?, body: String?, voice: Boolean): ExecOutcome {
        val lang = TextNorm.detectLang("${target ?: ""} ${body ?: ""}")
        val phone = target?.let { findPhone(it) }
        val link = when {
            phone != null -> "https://wa.me/${natOf(phone)}" +
                (if (!body.isNullOrBlank() && !voice) "?text=" + Uri.encode(body) else "")
            !target.isNullOrBlank() && body != null ->
                // unknown number: open chooser with prefilled text
                "https://api.whatsapp.com/send?text=" + Uri.encode("$body (to $target)")
            else -> "https://wa.me/"
        }
        val opened = runCatching {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse(link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            true
        }.getOrElse {
            JarvisLog.w("whatsapp open failed", it)
            false
        }
        if (!opened) return ExecOutcome(false, I18n.notFound(lang, "WhatsApp"))

        return ExecOutcome(
            true, when {
                voice -> buildString {
                    append(if (target != null) "Chat with $target opened. " else "WhatsApp opened. ")
                    append("Hold the microphone button to record your voice note.")
                }
                body != null -> buildString {
                    append(if (target != null) "Message to $target is typed. " else "Draft ready. ")
                    append("Tap the send button to deliver it.")
                }
                else -> "WhatsApp chat opened — what should I say?"
            }
        )
    }

    // ── SMS ──────────────────────────────────────────────────────────────────
    fun sms(target: String?, body: String?): ExecOutcome {
        val lang = TextNorm.detectLang("${target ?: ""} ${body ?: ""}")
        if (body.isNullOrBlank()) {
            val phone = target?.let { findPhone(it) }
            val opened = runCatching {
                context.startActivity(
                    Intent(Intent.ACTION_SENDTO, Uri.parse("sms:${phone ?: ""}"))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
                true
            }.getOrDefault(false)
            return ExecOutcome(opened, if (opened) "SMS app opened for ${target ?: "a new message"}" else I18n.notFound(lang, "an SMS app"))
        }
        val phone = target?.let { findPhone(it) } ?: return ExecOutcome(false, I18n.notFound(lang, "the number of '$target'"))

        if (!PermissionFinder(context).status(Capability.SMS).granted) {
            PermissionRequests.request(Manifest.permission.SEND_SMS)
            return ExecOutcome(false, I18n.noPermission(lang, "Send SMS") + " SMS app opened meanwhile.")
                .also {
                    runCatching {
                        context.startActivity(
                            Intent(Intent.ACTION_SENDTO, Uri.parse("sms:$phone")).putExtra("sms_body", body)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        )
                    }
                }
        }
        return runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val smsManager = context.getSystemService(android.telephony.SmsManager::class.java)
                smsManager?.sendTextMessage(phone, null, body, null, null)
            } else {
                @Suppress("DEPRECATION")
                android.telephony.SmsManager.getDefault().sendTextMessage(phone, null, body, null, null)
            }
            ExecOutcome(true, "SMS sent to $phone")
        }.getOrElse { t ->
            JarvisLog.w("sms send failed", t)
            openSmsApp(phone, body)
            ExecOutcome(false, "SMS could not be sent directly — the SMS app is opened with your draft.")
        }
    }

    private fun openSmsApp(phone: String?, body: String?) {
        runCatching {
            context.startActivity(
                Intent(Intent.ACTION_SENDTO, Uri.parse("sms:${phone ?: ""}"))
                    .apply { body?.let { putExtra("sms_body", it) } }
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }

    // ── E-mail (draft → user taps send inside the mail app) ─────────────────
    fun email(to: String?, subject: String?, body: String?): ExecOutcome {
        val intent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("mailto:")
            putExtra(Intent.EXTRA_EMAIL, arrayOf(to.orEmpty()))
            subject?.let { putExtra(Intent.EXTRA_SUBJECT, it) }
            body?.let { putExtra(Intent.EXTRA_TEXT, it) }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val launched = runCatching {
            context.startActivity(intent)
            true
        }.getOrDefault(false)
        val lang = TextNorm.detectLang("${subject ?: ""} ${body ?: ""}")
        return ExecOutcome(
            launched,
            when {
                launched && to.isNullOrBlank() -> "Mail draft opened — who should receive it?"
                launched -> "Draft email${subject?.let { " about '$it'" } ?: ""} prepared${to?.let { " for $it" } ?: ""}. Tap send to fire it."
                else -> I18n.notFound(lang, "a mail app")
            }
        )
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    private fun findPhone(query: String): String? {
        val direct = query.filter { it.isDigit() || it == '+' }
        if (direct.count { it.isDigit() } >= 8) return direct
        val contactsGranted = PermissionFinder(context).status(Capability.CONTACTS).granted
        if (!contactsGranted) {
            PermissionRequests.request(Manifest.permission.READ_CONTACTS)
            return null
        }
        return runCatching { resolver.find(query, 1).firstOrNull()?.number?.filter { it.isDigit() || it == '+' } }
            .getOrNull()?.takeIf { it.length >= 8 }
    }

    /** wa.me wants bare digits (country code included, no '+'). */
    private fun natOf(phone: String): String = phone.filter { it.isDigit() }
}

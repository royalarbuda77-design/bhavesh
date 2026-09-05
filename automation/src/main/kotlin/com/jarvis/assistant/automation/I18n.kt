package com.jarvis.assistant.automation

import com.jarvis.assistant.core.util.TextNorm

/**
 * Micro-localisation for spoken action feedback. Keeps the voice loop warm in
 * the user's own language even when no network is available for Gemini.
 */
internal object I18n {

    fun langOf(utterance: String): String = TextNorm.detectLang(utterance)

    fun done(lang: String, subject: String, state: String): String = when (lang) {
        "gu" -> "$subject $state કર્યું"
        "hi" -> "$subject $state किया गया"
        else -> "$subject $state"
    }

    fun noPermission(lang: String, permissionName: String): String = when (lang) {
        "gu" -> "ચાલુ કરવા માટે $permissionName પરવાનગી જોઈએ — સેટિંગ્સ ખોલું છું."
        "hi" -> "$permissionName अनुमति चाहिए — सेटिंग्स खोल रहा हूँ।"
        else -> "$permissionName permission is required — opening the settings screen for you."
    }

    fun panelOpened(lang: String, subject: String): String = when (lang) {
        "gu" -> "$subject સેટિંગ્સ પેનલ ખોલ્યું (Android આજ્ઞાકરણ મુજબ હું સીધું બદલી શકતો નથી) — હવે ટૅપ કરો."
        "hi" -> "$subject सेटिंग पैनल खोल दिया (Android नीति के कारण सीधे बदल नहीं सकता) — अब टैप करें।"
        else -> "Opened the $subject panel — Android doesn't allow apps to flip this silently, tap to confirm."
    }

    fun notFound(lang: String, what: String): String = when (lang) {
        "gu" -> "$what મળ્યું નહીં."
        "hi" -> "$what नहीं मिला।"
        else -> "Couldn't find $what."
    }

    fun offline(lang: String): String = when (lang) {
        "gu" -> "ઇન્ટરનેટ નથી — બેઝિક કમાન્ડ્સ ઑફલાઇન ચાલુ છે."
        "hi" -> "इंटरनेट नहीं — बुनियादी कमांड ऑफ़लाइन चल रहे हैं।"
        else -> "Offline — basic device commands still work."
    }

    fun ok(lang: String): String = when (lang) {
        "gu" -> "થઈ ગયું"
        "hi" -> "हो गया"
        else -> "Done"
    }
}

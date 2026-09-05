package com.jarvis.assistant.gemini

/** Typed error surface so the orchestrator can *speak* failures intelligently. */
enum class GeminiFailure {
    KEY_MISSING,          // user hasn't configured a key yet
    KEY_INVALID,          // 401/403
    RATE_LIMITED,         // 429
    MODEL_UNAVAILABLE,    // every candidate model 404'd
    NO_NETWORK,           // socket / connect failure
    BLOCKED,              // safety-blocked response
    PARSE,                // malformed JSON from API
    TIMEOUT
}

class GeminiException(
    val failure: GeminiFailure,
    override val message: String,
    cause: Throwable? = null
) : Exception(message, cause) {

    /** A short, polite, language-mirroring line the assistant can speak. */
    fun speakable(lang: String): String = when (failure) {
        GeminiFailure.KEY_MISSING -> when (lang) {
            "gu" -> "જાર્વિસને ગુગલ એપી કી જોઈએ. સેટિંગ્સ માં કી દાખલ કરો."
            "hi" -> "मुझे Google API चाहिए। कृपया सेटिंग्स में कुंजी जोड़ें।"
            else -> "Jarvis needs a Gemini API key. Please add it in Settings."
        }
        GeminiFailure.KEY_INVALID -> when (lang) {
            "gu" -> "એપી કી સ્વીકારાઈ નહીં. તપાસીને ફરી દાખલ કરો."
            "hi" -> "API कुंजी स्वीकार नहीं हुई। कृपया जाँचकर दोबारा डालें।"
            else -> "The API key was rejected. Please check it and try again."
        }
        GeminiFailure.RATE_LIMITED -> when (lang) {
            "gu" -> "થોડી વાર પછી ફરી કહો — કોટા લિમિટ પર પહોંચ્યો છીએ."
            "hi" -> "कुछ देर बाद फिर कहें — कोटा सीमा पर पहुँच गया हूँ।"
            else -> "I hit the free-tier rate limit — ask me again in a moment."
        }
        GeminiFailure.NO_NETWORK -> when (lang) {
            "gu" -> "ઇન્ટરનેટ નથી. ઑફલાઇન કમાન્ડ્સ ચાલુ રહેશે."
            "hi" -> "इंटरनेट नहीं है। ऑफ़लाइन कमांड चलते रहेंगे।"
            else -> "No internet. Offline commands still work."
        }
        else -> when (lang) {
            "gu" -> "થોડી તકનીકી સમસ્યા હતી — ફરી પ્રયાસ કરો."
            "hi" -> "एक छोटी तकनीकी समस्या थी — फिर से कोशिश करें।"
            else -> "Hit a small technical snag — trying again shortly."
        }
    }
}

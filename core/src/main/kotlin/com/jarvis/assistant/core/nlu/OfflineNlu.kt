package com.jarvis.assistant.core.nlu

import com.jarvis.assistant.core.util.ClockWords
import com.jarvis.assistant.core.util.NumberWords
import com.jarvis.assistant.core.util.TextNorm

/**
 * Fully-offline, sub-millisecond utterance → intent router.
 *
 * Design: [parse] is a pure function (JVM-testable, no Android deps) so the
 * app can ship 40+ device-control capabilities with zero network — Gemini is
 * only consulted as (a) fallback for unseen phrasings and (b) general chat.
 */
object OfflineNlu {

    fun parse(rawUtterance: String): NluIntent? {
        val u = TextNorm.collapse(
            TextNorm.stripFillers(TextNorm.toLatinDigits(TextNorm.normalize(rawUtterance)))
        )
        if (u.isBlank()) return null

        controlIntent(u)?.let { return it }
        systemIntent(u)?.let { return it }
        clockIntent(u)?.let { return it }
        notificationIntent(u)?.let { return it }
        reportIntent(u)?.let { return it }
        mediaIntent(u)?.let { return it }
        appIntent(u)?.let { return it }
        commsIntent(u)?.let { return it }
        screenIntent(u)?.let { return it }
        navigationIntent(u)?.let { return it }
        noteIntent(u)?.let { return it }
        calendarIntent(u)?.let { return it }
        return null
    }

    /** Cheap pre-filter for spending an LLM token on action-parsing. */
    fun looksLikeAction(utterance: String): Boolean {
        val u = TextNorm.normalize(utterance)
        val verbs = listOf(
            "on", "off", "karo", "કરો", "करो", "open", "close", "chalavo", "બંધ", "चलाओ",
            "set", "send", "ભેજો", "मोकल", "call", "કૉલ", "play", "pause", "next", "toggle",
            "remind", "યાદ", "याद", "alarm", "timer", "ડાયલ", "dial", "navigate", "scroll", "back", "home"
        )
        return verbs.any { u.contains(it) }
    }

    // ── wake / sleep / stop ──────────────────────────────────────────────────
    fun isWakePhrase(utterance: String): Boolean {
        val u = TextNorm.normalize(utterance)
        return Lexicon.anyMatch(u, Lexicon.wakeUpPhrases) ||
            TextNorm.addressedToJarvis(u, Lexicon.wakeVariants)
    }

    fun isShutdownPhrase(utterance: String): Boolean =
        Lexicon.anyMatch(TextNorm.normalize(utterance), Lexicon.shutdownPhrases)

    fun isStopSpeaking(utterance: String): Boolean =
        Lexicon.anyMatch(TextNorm.normalize(utterance), Lexicon.stopSpeakingPhrases)

    fun mentionsJarvis(transcript: String): Boolean =
        TextNorm.addressedToJarvis(transcript, Lexicon.wakeVariants)

    // ── helpers ──────────────────────────────────────────────────────────────
    private fun extractAfter(text: String, markers: List<String>): String? {
        for (m in markers) {
            val idx = text.indexOf(m)
            if (idx >= 0) {
                val tail = text.substring(idx + m.length).trim()
                if (tail.isNotEmpty()) return tail
            }
        }
        return null
    }

    private fun cleanTarget(t: String?): String? =
        t?.let { TextNorm.collapse(Regex("""^(ka|ki|ke|no|ni|ne|to|ko|karne|ka number|number|nu|nambar)\s+""").replace(it, "")) }
            ?.takeIf { it.isNotBlank() && it.length >= 2 && it.count { c -> c.isLetterOrDigit() } >= 2 }

    // ── CONTROL ──────────────────────────────────────────────────────────────
    private fun controlIntent(u: String): NluIntent? = when {
        Lexicon.anyMatch(u, Lexicon.scrollUp) -> NluIntent(NluDomain.CONTROL, NluOp.UP, rawUtterance = u)
        Lexicon.anyMatch(u, Lexicon.scrollDown) -> NluIntent(NluDomain.CONTROL, NluOp.DOWN, rawUtterance = u)
        Lexicon.anyMatch(u, Lexicon.back) -> NluIntent(NluDomain.CONTROL, NluOp.BACK, rawUtterance = u)
        Lexicon.anyMatch(u, Lexicon.home) -> NluIntent(NluDomain.CONTROL, NluOp.HOME, rawUtterance = u)
        else -> null
    }

    // ── SYSTEM settings ──────────────────────────────────────────────────────
    private fun systemIntent(u: String): NluIntent? {
        val setting = Lexicon.matchSetting(u) ?: return null
        val op = when {
            Lexicon.anyMatch(u, Lexicon.statusAsk) -> NluOp.STATUS
            Lexicon.anyMatch(u, Lexicon.toggle) &&
                !Lexicon.anyMatch(u, Lexicon.on) && !Lexicon.anyMatch(u, Lexicon.off) -> NluOp.TOGGLE
            Lexicon.anyMatch(u, Lexicon.off) -> NluOp.OFF
            Lexicon.anyMatch(u, Lexicon.on) -> NluOp.ON
            setting == "brightness" || setting == "volume" -> NluOp.SET
            else -> NluOp.TOGGLE
        }
        val slots = HashMap<String, String>()
        slots["setting"] = setting
        if (op == NluOp.SET) {
            val pct = Regex("""(\d{1,3})\s*%?""").find(u)?.groupValues?.get(1)?.toIntOrNull()
                ?: NumberWords.parse(u)
            pct?.coerceIn(0, 100)?.let { slots["value"] = it.toString() }
            when {
                u.contains("vadhare") || u.contains("વધારે") || u.contains("up") || u.contains("तेज़") || u.contains("more") ->
                    slots["delta"] = "+20"
                u.contains("dhare") || u.contains("ઓછું") || u.contains("कम") || u.contains("down") || u.contains("less") ->
                    slots["delta"] = "-20"
            }
        }
        // explicit toggle word even with on/off absent handled above; add "panel" request
        if (Lexicon.anyMatch(u, listOf("settings kholo", "open settings", "સેટિંગ્સ ખોલો"))) {
            slots["panel"] = "true"
        }
        return NluIntent(NluDomain.SYSTEM, op, slots, u)
    }

    // ── CLOCK: alarm / timer / stopwatch ─────────────────────────────────────
    private fun clockIntent(u: String): NluIntent? {
        if (Lexicon.anyMatch(u, Lexicon.stopwatch)) {
            val op = if (Lexicon.anyMatch(u, Lexicon.off)) NluOp.CLEAR else NluOp.SET
            return NluIntent(NluDomain.CLOCK, op, mapOf("kind" to "stopwatch"), u)
        }
        if (Lexicon.anyMatch(u, Lexicon.timer)) {
            val mins = ClockWords.parseDelayMinutes(u)
            return if (Lexicon.anyMatch(u, Lexicon.off) || Lexicon.anyMatch(u, listOf("cancel", "રદ", "रद्द"))) {
                NluIntent(NluDomain.CLOCK, NluOp.CLEAR, mapOf("kind" to "timer"), u)
            } else {
                NluIntent(
                    NluDomain.CLOCK, NluOp.SET,
                    buildMap {
                        put("kind", "timer")
                        mins?.let { put("minutes", it.toString()) }
                    }, u
                )
            }
        }
        if (!Lexicon.anyMatch(u, Lexicon.alarm) && !u.contains("વાગ્યે") && !u.contains("बजे")) return null

        if (Lexicon.anyMatch(u, listOf("dismiss", "બંધ કરો એલાર્મ", "alarm off", "बंद करो अलार्म"))) {
            return NluIntent(NluDomain.CLOCK, NluOp.CLEAR, mapOf("kind" to "alarm"), u)
        }
        if (Lexicon.anyMatch(u, listOf("show alarm", "કયાં એલાર્મ", "my alarms", "list alarm"))) {
            return NluIntent(NluDomain.CLOCK, NluOp.LIST, mapOf("kind" to "alarm"), u)
        }
        val guess = ClockWords.parseTimeOfDay(u) ?: return NluIntent(
            NluDomain.CLOCK, NluOp.SET, mapOf("kind" to "alarm", "ambiguous" to "true"), u
        )
        val label = extractAfter(u, listOf("kahi", "કહીને", "लखो", "label", "note", "sath "))
        return NluIntent(
            NluDomain.CLOCK, NluOp.SET,
            buildMap {
                put("kind", "alarm")
                put("hour", guess.hour.toString())
                put("minute", guess.minute.toString())
                put("dayOffset", guess.dayOffset.toString())
                put("resolved", guess.amPmResolved.toString())
                label?.let { put("label", it) }
            }, u
        )
    }

    // ── NOTIFICATIONS ────────────────────────────────────────────────────────
    private fun notificationIntent(u: String): NluIntent? = when {
        !Lexicon.anyMatch(u, Lexicon.notificationsRead) && !Lexicon.anyMatch(u, Lexicon.dismiss) -> null
        Lexicon.anyMatch(u, Lexicon.dismiss) -> NluIntent(NluDomain.NOTIFICATION, NluOp.CLEAR, rawUtterance = u)
        else -> NluIntent(NluDomain.NOTIFICATION, NluOp.READ, rawUtterance = u)
    }

    // ── DEVICE REPORTS ───────────────────────────────────────────────────────
    private fun reportIntent(u: String): NluIntent? = when {
        Lexicon.anyMatch(u, Lexicon.battery) -> NluIntent(NluDomain.REPORT, NluOp.STATUS, mapOf("topic" to "battery"), u)
        Lexicon.anyMatch(u, Lexicon.storage) -> NluIntent(NluDomain.REPORT, NluOp.STATUS, mapOf("topic" to "storage"), u)
        Lexicon.anyMatch(u, listOf("ram", "memory free", "રૅમ")) ->
            NluIntent(NluDomain.REPORT, NluOp.STATUS, mapOf("topic" to "memory"), u)
        Lexicon.anyMatch(u, listOf("device info", "ફોન વિગત", "phone info", "કયો ફોન")) ->
            NluIntent(NluDomain.REPORT, NluOp.STATUS, mapOf("topic" to "device"), u)
        else -> null
    }

    // ── MEDIA ────────────────────────────────────────────────────────────────
    private fun mediaIntent(u: String): NluIntent? {
        val hasMusicWord = Lexicon.anyMatch(u, Lexicon.song) || Lexicon.anyMatch(u, Lexicon.radio) ||
            Lexicon.anyMatch(u, Lexicon.playlist) || u.contains("video") || Lexicon.anyMatch(u, Lexicon.youtube) ||
            Lexicon.anyMatch(u, Lexicon.spotify)
        if (!hasMusicWord && !Lexicon.anyMatch(u, Lexicon.pause) &&
            !Lexicon.anyMatch(u, Lexicon.nextT) && !Lexicon.anyMatch(u, Lexicon.prevT)
        ) return null

        val op = when {
            Lexicon.anyMatch(u, Lexicon.pause) -> NluOp.PAUSE
            Lexicon.anyMatch(u, Lexicon.nextT) -> NluOp.NEXT
            Lexicon.anyMatch(u, Lexicon.prevT) -> NluOp.PREV
            else -> NluOp.PLAY
        }
        if (op != NluOp.PLAY) return NluIntent(NluDomain.MEDIA, op, emptyMap(), u)

        val service = when {
            Lexicon.anyMatch(u, Lexicon.youtube) -> "youtube"
            Lexicon.anyMatch(u, Lexicon.spotify) -> "spotify"
            else -> "any"
        }
        val query = extractPlayQuery(u)
        return NluIntent(NluDomain.MEDIA, op, buildMap {
            put("service", service)
            query?.let { put("query", it) }
        }, u)
    }

    private fun extractPlayQuery(u: String): String? {
        // "play <q> on youtube" / "youtube par <q> chalavo" / "<q> walo geet"
        val playIdx = Lexicon.firstMatch(u, listOf("play ", "chalavo ", "चलाओ ", "chalao ", "sunao "))?.let { u.indexOf(it) } ?: -1
        if (playIdx >= 0) {
            var q = u.substring(playIdx).trim()
            listOf("play", "chalavo", "chalaao", "sunao", "चलाओ").forEach { w ->
                if (q.startsWith(w)) q = q.removePrefix(w).trim()
            }
            q = Regex("""\s+(on|par|pe|upon)\s+(youtube|yt|spotify|the [a-z ]+)$""").replace(q, "")
            q = Regex("""\s+(youtube|spotify|yt)\s+(par|pe)""").replace(q, "")
            return q.trim().takeIf { it.isNotBlank() && it.length > 1 }
        }
        val ytm = Regex("""(?:youtube|spotify)\s+(?:par|pe|on)\s+(.+)""").find(u)
        return ytm?.groupValues?.get(1)?.trim()?.takeIf { it.isNotBlank() }
    }

    // ── APP launch/close ─────────────────────────────────────────────────────
    private fun appIntent(u: String): NluIntent? {
        val isOpen = Lexicon.anyMatch(u, Lexicon.open) || u.contains("khol")
        val isClose = Lexicon.anyMatch(u, Lexicon.close) || u.contains("bandh karo app")
        if (!isOpen && !isClose) return null

        // known alias first
        val aliasHit = Lexicon.appAliases.entries.firstOrNull { (_, al) -> Lexicon.anyMatch(u, al) }?.key
        if (aliasHit != null) {
            // guard: don't hijack "open wifi settings" → app
            if (Lexicon.matchSetting(u) != null && u.contains("setting")) return null
            return NluIntent(
                NluDomain.APP,
                if (isOpen) NluOp.OPEN else NluOp.CLOSE,
                mapOf("target" to aliasHit), u
            )
        }
        val quoted = Regex("""["“'](.+?)["”']""").find(u)?.groupValues?.get(1)
        val named = quoted ?: extractAfter(u, listOf("app ", "ऐप ", "એપ "))
            ?.split(' ')?.firstOrNull()
        if (named != null && named.length >= 3 && !named.contains("setting")) {
            return NluIntent(NluDomain.APP, if (isOpen) NluOp.OPEN else NluOp.CLOSE, mapOf("target" to cleanTarget(named) ?: named), u)
        }
        return null
    }

    // ── COMMUNICATION ────────────────────────────────────────────────────────
    private fun commsIntent(u: String): NluIntent? {
        val isCall = Lexicon.anyMatch(u, Lexicon.call)
        val isWa = Lexicon.anyMatch(u, Lexicon.whatsapp)
        val isSms = Lexicon.anyMatch(u, Lexicon.sms) && !isWa
        val isMail = Lexicon.anyMatch(u, Lexicon.email)

        if (isMail && (Lexicon.anyMatch(u, Lexicon.sendWords) || u.contains("draft") || u.contains("લખો") || u.contains("लिखो"))) {
            val slots = HashMap<String, String>()
            slotAfter(u, listOf("to ", "ne ", "નો "), "recipient")?.let { slots["recipient"] = it }
            subjectOf(u)?.let { slots["subject"] = it }
            bodyOf(u)?.let { slots["body"] = it }
            return NluIntent(NluDomain.EMAIL, NluOp.WRITE, slots, u)
        }

        if (isWa || (isSms && Lexicon.anyMatch(u, Lexicon.sendWords))) {
            val slots = HashMap<String, String>()
            slots["service"] = if (isWa) "whatsapp" else "sms"
            slotAfter(u, listOf("to ", "ne ", "nu "), "target")?.let { slots["target"] = it }
            bodyOf(u)?.let { slots["body"] = it }
            val op = if (slots.containsKey("body")) NluOp.WRITE else NluOp.OPEN
            return NluIntent(NluDomain.MESSAGE, op, slots, u)
        }

        if (isSms && !isWa && bodyOf(u) != null) {
            return NluIntent(
                NluDomain.SMS, NluOp.WRITE,
                buildMap {
                    put("body", bodyOf(u)!!)
                    slotAfter(u, listOf("to ", "ne "), "target")?.let { put("target", it) }
                }, u
            )
        }

        if (isCall) {
            val slots = HashMap<String, String>()
            if (Lexicon.anyMatch(u, Lexicon.videoCall)) slots["video"] = "true"
            // "call mom", "mom ko call karo", "call +91…"
            Regex("""(\+?\d[\d\s-]{6,14}\d)""").find(u)?.groupValues?.get(1)?.let {
                slots["number"] = it.filter { c -> c.isDigit() || c == '+' }
            }
            val name = callTarget(u)
            if (slots["number"] == null && name != null) slots["target"] = name
            if (slots.isEmpty()) return null
            return NluIntent(NluDomain.CALL, NluOp.WRITE, slots, u)
        }
        return null
    }

    private fun callTarget(u: String): String? {
        // strip the word "call" and verbs, what's left as a name candidate
        val stripped = Regex("""(call|phone|कॉल|કૉલ|લગાવો|lagao|करो|કરો|કરો|no|ka|ki|ke|ko|par)\s*""").replace(u, " ")
        val t = TextNorm.collapse(stripped).trim()
        return t.takeIf { it.length in 2..40 && it.none { c -> c.isDigit() } }
    }

    private fun slotAfter(u: String, markers: List<String>, key: String): String? {
        for (m in markers) {
            val i = u.indexOf(m)
            if (i >= 0) {
                val rest = u.substring(i + m.length).trim()
                val cut = listOf(" ke ", " no ", " saying ", " કહીને ", " लखो ", " body ").firstOrNull { rest.contains(it) }
                val piece = cut?.let { rest.substringBefore(it) } ?: rest
                cleanTarget(piece)?.let { return it }
            }
        }
        return null
    }

    private fun subjectOf(u: String): String? {
        val about = Regex("""(?:about|vishe|વિશે|विषय|subject)\s+[:\-]?\s+(.+)""").find(u)
        return about?.groupValues?.get(1)?.trim()?.takeIf { it.length > 2 }
    }

    private fun bodyOf(u: String): String? {
        val m = Regex(
            """(?:saying|kahi|कहना|કહો|લખો કે|likho ki|message\s*[:\-]|body\s*[:\-]|ke\s+)(.+)$"""
        ).find(u)
        val t = m?.groupValues?.get(1)?.trim()
        return t?.takeIf { it.length >= 2 }
    }

    // ── SCREEN / VISION ──────────────────────────────────────────────────────
    private fun screenIntent(u: String): NluIntent? = when {
        Lexicon.anyMatch(u, Lexicon.readScreen) ->
            NluIntent(NluDomain.SCREEN, NluOp.READ, rawUtterance = u)
        Lexicon.anyMatch(u, Lexicon.screenHere) &&
            (u.contains("shu") || u.contains("શું") || u.contains("क्या") || u.contains("what") ||
                u.contains("samjhao") || u.contains("સમજાવ")) ->
            NluIntent(NluDomain.SCREEN, NluOp.READ, mapOf("vision" to "true", "question" to u), u)
        else -> null
    }

    // ── NAVIGATION ───────────────────────────────────────────────────────────
    private fun navigationIntent(u: String): NluIntent? {
        if (!Lexicon.anyMatch(u, Lexicon.navigate)) return null
        val place = extractAfter(u, listOf("to ", "lakhi ", "per ", "tak ", "લઈ જાઓ ", "पर "))
            ?.substringBefore(" ka ")?.trim()?.takeIf { it.length > 1 && it != "home" && it != "office" }
            ?: return null
        val slots = mapOf("place" to place)
        return NluIntent(NluDomain.NAVIGATION, NluOp.WRITE, slots, u)
    }

    // ── MEMORY / NOTES ───────────────────────────────────────────────────────
    private fun noteIntent(u: String): NluIntent? = when {
        Lexicon.anyMatch(u, Lexicon.recallAsk) -> NluIntent(NluDomain.NOTE, NluOp.LIST, rawUtterance = u)
        Lexicon.anyMatch(u, Lexicon.remember) -> {
            val content = u.substringAfter("remember").substringAfter("યાદ રાખો")
                .substringAfter("yaad rakho").trim().removePrefix("ke").trim()
            if (content.length < 3) NluIntent(NluDomain.NOTE, NluOp.LIST, rawUtterance = u)
            else NluIntent(NluDomain.NOTE, NluOp.ADD, mapOf("content" to content), u)
        }
        else -> null
    }

    // ── CALENDAR ─────────────────────────────────────────────────────────────
    private fun calendarIntent(u: String): NluIntent? {
        val calish = Lexicon.anyMatch(u, Lexicon.calendar) ||
            Lexicon.anyMatch(u, Lexicon.meetingWord()) ||
            u.contains("schedule")
        if (!calish) return null
        val isAdd = Lexicon.anyMatch(u, listOf("add", "create", "banavo", "સાધારણ", "બનાવો", "जोड़ो", "meeting rakh"))
        val whenSlot = when {
            Lexicon.anyMatch(u, Lexicon.today) -> "today"
            Lexicon.anyMatch(u, Lexicon.tomorrow) -> "tomorrow"
            else -> "today"
        }
        val title = extractAfter(u, listOf("meeting ", "event ", "કામ ", "कार्यक्रम "))
        val slots = buildMap {
            put("when", whenSlot)
            cleanTarget(title)?.let { put("title", it) }
        }
        return NluIntent(NluDomain.CALENDAR, if (isAdd) NluOp.ADD else NluOp.LIST, slots, u)
    }

    private fun Lexicon.meetingWord() = listOf("meeting", "બેઠક", "बैठक", "appointment", "કામગીરી")
}

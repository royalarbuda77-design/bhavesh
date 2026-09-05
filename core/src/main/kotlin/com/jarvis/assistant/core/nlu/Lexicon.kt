package com.jarvis.assistant.core.nlu

/**
 * Tri-lingual synonym tables (Gujarati · Hindi · English + romanised
 * "Gujlish/Hinglish", because ASR frequently emits Latin script).
 * Canonical values (e.g. "wifi") are what ActionExecutor switches on —
 * never rename those, only extend the alias lists.
 */
object Lexicon {

    // ── Generic verbs ───────────────────────────────────────────────────────
    val on = listOf(
        "on", "ચાલુ", "चालू", "chaloo", "chalu", "on karo", "on करो", "કરો", "enable",
        "चालु करो", "ચાલુ કરો", "on thro", "on rakh", "jalo", "jalao", "જાળવો"
    )
    val off = listOf(
        "off", "બંધ", "बंद", "band", "bandh", "off karo", "off करो", "disable", "બંધ કરો",
        "बंद करो", "off kardo", "band karo", "bandh karo", "off thro"
    )
    val toggle = listOf("toggle", "બદલો", "बदलो", "badlo", "switch", "સ્વિચ", "બદલ", "उलट")

    val open = listOf(
        "open", "ખોલો", "खोलो", "kholo", "khol", "launch", "run", "shuru karo", "start app", "fire up"
    )
    val close = listOf(
        "close", "band karo app", "kill", "exit", "close karo", "बंद करो ऐप", "એપ બંધ", "app bandh"
    )
    val play = listOf("play", "ચલાવો", "चलाओ", "chalavo", "chalao", "sunao", "શણો", "start music", "सुनाओ")
    val pause = listOf("pause", "રોકો", "रोको", "ruko", "stop music", "થોભાવો", "hold")
    val nextT = listOf("next", "આગળ", "अगला", "aage", "skip", "next song", "આગળ વધારો")
    val prevT = listOf("previous", "પાછલું", "पिछला", "peechhe", "prev", "back song", "પાછું ગાનું")

    val statusAsk = listOf(
        "status", "state", "check karo", "તપાસો", "چہا ہے", "on hai ya nahi", "on chhe ke", "કેમ છે", "current status"
    )

    // ── System settings ─────────────────────────────────────────────────────
    /** canonical key → match tokens */
    val settings: Map<String, List<String>> = mapOf(
        "wifi" to listOf("wifi", "wi fi", "wi-fi", "વાઇફાઇ", "واي فاي", "wireless internet", "વાઈફાઈ"),
        "bluetooth" to listOf("bluetooth", "બ્લૂટૂથ", "ब्लूटूथ", "blue tooth", "bt audio"),
        "torch" to listOf("torch", "flashlight", "flash light", "ફ્લેશલાઇટ", "टॉर्च", "બત્તી", "बत्ती", "light jalao", "phone light"),
        "hotspot" to listOf("hotspot", "hot spot", "હોટસ્પોટ", "tethering", "internet share", "wifi share"),
        "gps" to listOf("gps", "location", "લોકેશન", "लोकेशन", "track my phone", "map location"),
        "brightness" to listOf("brightness", "બ્રાઇટનેસ", "चमक", "roshni", "તેજ વધારો", "screen light level"),
        "volume" to listOf("volume", "અવાજ", "आवाज़", "awaaz", "aawaz", "sound level"),
        "dnd" to listOf("dnd", "do not disturb", "ધ્યન ભંગ", "नॉट डिस्टरબ", "disturb mode"),
        "silent" to listOf("silent", "શાંત", "shaant", "quiet mode", "chup chap mode", "રિંગ બંધ"),
        "airplane" to listOf("airplane", "flight mode", "એરપ્લેન મોડ", "एयरप्लेन", "aeroplane mode"),
        "rotation" to listOf("rotation", "auto rotate", "screen rotate", "રોટેશન", "ઑરિએન્ટેશન", "लॉक घुमाओ"),
        "auto_brightness" to listOf("auto brightness", "adaptive brightness", "ઓટો બ્રાઇટનેस", "automatic brightness"),
        "mobile_data" to listOf("mobile data", "ડેટા", "gprs", "4g", "5g", "cell data", "internet sim"),
        "nfc" to listOf("nfc", "એનએફસી", "tap pay"),
        "night_light" to listOf("night light", "eye protect", "આંખ સુરક્ષા", "blue light filter", "reading mode"),
        "dark_theme" to listOf("dark mode", "theme dark", "ડાર્ક થીમ", "डार्क मोड"),
        "power_saver" to listOf("power saver", "battery saver", "બેટરી સેવર", "battery bachao"),
        "screen_timeout" to listOf("screen timeout", "screen off time", "સ્ક્રીન ટાઇમઆઉટ", "auto lock time")
    )

    // ── Media targets ───────────────────────────────────────────────────────
    val youtube = listOf("youtube", "યુટ્યુબ", "यूट्यूब", "yt")
    val spotify = listOf("spotify", "સ્પોટિફાઈ", "स्पॉटिफाई", "spotify")
    val playlist = listOf("playlist", "પ્લેલિસ્ટ", "प्लेलિस्ट")
    val song = listOf("song", "ગીત", "gaana", "गाना", "track", "music", "સંગીત")
    val radio = listOf("radio", "રેડિયो", "रेडियो")

    // ── Communication ───────────────────────────────────────────────────────
    val call = listOf("call", "ફોન કરો", "phone karo", "कॉल", "dial", "કોલ કરો", "lagao call", "call lagao", "ફોન લગાવો")
    val videoCall = listOf("video call", "વિડિયો કૉલ", "वीडियो कॉल", "video whatsapp")
    val whatsapp = listOf("whatsapp", "વોટ્સએપ", "व्हाट्सएप", "what's app", "hatsapp")
    val sms = listOf("sms", "સંદેશ", "sandesh", "text karo", "message bhejo", "એસએમએસ", "message send")
    val email = listOf("email", "mail", "ઈમેલ", "ईमेल", "gmail", "mejl")
    val sendWords = listOf("send", "મોકલો", "moklo", "भेजो", "bhejo", "પ્રેષણ કરો", "send karo", "lekho")

    // ── Clock / calendar ─────────────────────────────────────────────────────
    val alarm = listOf("alarm", "એલાર્મ", "अलार्म", "jagado", "જગાડો", "wake me", "uttharna", "ઉઠાડો")
    val timer = listOf("timer", "ટાઈમર", "टाइमर", "countdown", "count down")
    val stopwatch = listOf("stopwatch", "સ્ટોપવોચ", "स्टॉपवॉच")
    val reminder = listOf("remind", "reminder", "યાદ અપાવો", "yaad dilao", "याद दिलाओ", "remind me", "યાદ કરાવો")
    val remember = listOf("remember", "યાદ રાખો", "yaad rakho", "याद रखो", "note karo", "save this", "memory ma nakh")
    val recallAsk = listOf("what do you remember", "શું યાદ છે", "kya yaad hai", "my memory", "મારી પસંદ")
    val calendar = listOf("calendar", "કૅલેન્ડર", "कैलेंडर", "schedule", "meeting", "ayojana")
    val today = listOf("today", "આજે", "aaje", "आज", "aj")
    val tomorrow = listOf("tomorrow", "આવતીકાલે", "aavtikale", "कल", "kal")

    // ── Utilities ─────────────────────────────────────────────────────────────
    val battery = listOf("battery", "બેટરી", "बैटरी", "power level", "charge")
    val storage = listOf("storage", "space", "સ્ટોરેજ", "memory free", "diskspace", "ઝગ્ગી જગ્યા", "storage bacha")
    val notificationsRead = listOf("notification", "નોટિફિકેશન", "नोटिफिकेशन", "new message", "કોણ મેસેજ કર્યો", "unread")
    val dismiss = listOf("dismiss", "clear all", "બધા કાઢી નાખો", "हटाओ", "cancel notifications", "સાફ કરો નોટિફ")

    // ── Screen / vision ──────────────────────────────────────────────────────
    val screenHere = listOf("here", "this screen", "what is this", "અહીં શું", "आज这里", "on screen", "screenshot", "આ સ્ક્રીન")
    val readScreen = listOf("read screen", "read this", "શું લખ્યું છે", "kya likha", "what does it say", "વાંચી આપો", "पढ़ो")

    // ── Control (accessibility gestures) ─────────────────────────────────────
    val back = listOf("go back", "પાછળ જાવ", "peeche jao", "वापस जाओ", "press back", "back button")
    val home = listOf("go home", "ઘરે જાવ", "घर जाओ", "ghar jao", "main screen", "press home", "go to home screen")
    val scrollUp = listOf("scroll up", "upar scroll", "ઉપર સ્ક્રોલ", "slide up", "ऊपर स्क्रॉल")
    val scrollDown = listOf("scroll down", "neeche scroll", "નીચે સ્ક્રોલ", "slide down", "नीचे स्क्रॉल")

    // ── Navigation ───────────────────────────────────────────────────────────
    val navigate = listOf("directions", "rasto", "રાસ્તો", "रास्ता", "navigate", "go to", "le chalo", "લઈ જાઓ", "marg")

    // ── Wake / sleep ─────────────────────────────────────────────────────────
    /** STT hears "Jarvis" as many things — cover them all. */
    val wakeVariants = listOf(
        "jarvis", "જારવિસ", "જારવીસ", "जार्विस", "jervis", "charvis", "jarvis sir", "jrvs",
        "charness", "jaervis", "javis", "jarviss", "jarvis ji", "jarvis"
    )
    val wakeUpPhrases = listOf(
        "wake up jarvis", "wake jarvis", "jarvis wake", "hello jarvis", "hey jarvis",
        "જારવિસ જાગો", "jarvis jaggo", "jarvis utho", "જારવિસ ઉઠો", "jarvis on"
    )
    val shutdownPhrases = listOf(
        "shutdown jarvis", "shut down jarvis", "શટડાઉન જારવિસ", "jarvis shutdown", "jarvis band",
        "બંધ થાઓ", "સૂઈ જાઓ", "so jao", "so jao jarvis", "sleep jarvis", "jarvis so",
        "turn off jarvis", "બંધ કરી નાખો જારવિસ", "jarvis ko band karo"
    )
    val stopSpeakingPhrases = listOf(
        "stop talking", "chup", "ચૂપ", "बोलना बंद", "bas karo", "bas", "પૂરૂં", "quiet please",
        "shut up", "stop it", "વાત બંધ કરો", "chup ho jao"
    )

    // ── Apps ────────────────────────────────────────────────────────────────
    /** display-name hints used when the launcher can't resolve directly. */
    val appAliases: Map<String, List<String>> = mapOf(
        "WhatsApp" to listOf("whatsapp", "વોટ્સએપ", "व्हाट्सएप", "wa"),
        "YouTube" to listOf("youtube", "યુટ્યુબ", "यूट्यूब", "yt"),
        "Instagram" to listOf("instagram", "ઇન્સ્ટાગ્રામ", "इंस्टाग्राम", "insta"),
        "Facebook" to listOf("facebook", "ફેસબુક", "फेसबुक", "fb"),
        "Maps" to listOf("maps", "map", "google maps", "મેપ્સ", "नक्शा", "naksha"),
        "Camera" to listOf("camera", "કેમેરા", "कैमरा", "selfie"),
        "Gallery" to listOf("gallery", "photos", "ગેલેરી", "tasveer", "फोटो"),
        "Clock" to listOf("clock", "ઘડિયાળ", "घड़ी", "ghadi"),
        "Calendar" to listOf("calendar", "કૅલેન્ડર", "कैलेंडर"),
        "Gmail" to listOf("gmail", "mail app", "ઈમેલ", "ईमेल ऐप"),
        "Chrome" to listOf("chrome", "browser", "બ્રાઉઝર", "ब्राउज़र"),
        "Settings" to listOf("settings", "સેટિંગ્સ", "सेटिंग्स"),
        "Spotify" to listOf("spotify", "સ્પોટિફાઈ", "स्पॉटिफाई"),
        "Telegram" to listOf("telegram", "ટેલિગ્રામ", "टेलीग्राम"),
        "X" to listOf("twitter", "x app", "ટ્વિટર", "ट्विटर"),
        "Phone" to listOf("dialer", "phone app", "ડાયલર", "फोन ऐप"),
        "Messages" to listOf("messages", "સંદેશા", "messaging app"),
        "Play Store" to listOf("playstore", "play store", "પ્લે સ્ટોર", "प्ले स्टोर"),
        "Calculator" to listOf("calculator", "કૅલ્ક્યુલેટર", "कैलक्युलेटर", "calc"),
        "Notes" to listOf("notes", "નોટ્સ", "नोट्स ऐप"),
        "Files" to listOf("files", "file manager", "ફાઈલ મેનેજર")
    )

    fun anyMatch(text: String, words: Collection<String>): Boolean = words.any { text.contains(it) }
    fun firstMatch(text: String, words: Collection<String>): String? = words.firstOrNull { text.contains(it) }

    /** Which canonical setting, if any, does this utterance mention? */
    fun matchSetting(text: String): String? =
        settings.entries.firstOrNull { (_, aliases) -> anyMatch(text, aliases) }?.key
}

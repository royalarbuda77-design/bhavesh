package com.jarvis.assistant.automation.apps

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.jarvis.assistant.automation.I18n
import com.jarvis.assistant.automation.system.ExecOutcome
import com.jarvis.assistant.core.log.JarvisLog
import com.jarvis.assistant.core.memory.UserMemory
import com.jarvis.assistant.core.nlu.Lexicon
import com.jarvis.assistant.core.util.TextNorm

data class AppInfo(val packageName: String, val label: String)

/**
 * Launches any installed app by spoken name across EN/GU/HI + romanised.
 * Maintains a lazy cache of launcher entries (query happens on first use or
 * after PACKAGE_ADDED/REMOVED broadcast — see BootReceiver wiring).
 */
class AppController(
    private val context: Context,
    private val memory: UserMemory
) {

    @Volatile private var cache: List<AppInfo> = emptyList()
    @Volatile private var cachedAt = 0L
    private val ttlMs = 10 * 60_000L

    private val wellKnown = mapOf(
        "whatsapp" to "com.whatsapp",
        "youtube" to "com.google.android.youtube",
        "spotify" to "com.spotify.music",
        "instagram" to "com.instagram.android",
        "facebook" to "com.facebook.katana",
        "chrome" to "com.android.chrome",
        "gmail" to "com.google.android.gm",
        "maps" to "com.google.android.apps.maps",
        "camera" to "com.android.camera",
        "calculator" to "com.google.android.calculator",
        "clock" to "com.google.android.deskclock",
        "calendar" to "com.google.android.calendar",
        "settings" to "com.android.settings",
        "telegram" to "org.telegram.messenger",
        "twitter" to "com.twitter.android",
        "x" to "com.twitter.android",
        "phonepe" to "com.phonepe.app",
        "paytm" to "net.one97.paytm",
        "gpay" to "com.google.android.apps.nbu.paisa.user",
        "amazon" to "com.amazon.mShop.android.shopping",
        "flipkart" to "com.flipkart.android",
        "meesho" to "com.meeshosupply",
        "netflix" to "com.netflix.mediaclient",
        "prime video" to "com.amazon.avod.thirdpartyclient",
        "jio cinema" to "com.jio.myjio",
        "snapchat" to "com.snapchat.android",
        "linkdin" to "com.linkedin.android",
        "linkedin" to "com.linkedin.android",
        "files" to "com.google.android.documentsui",
        "play store" to "com.android.vending"
    )

    fun invalidate() { cachedAt = 0L }

    private fun catalog(): List<AppInfo> {
        val now = System.currentTimeMillis()
        if (cache.isNotEmpty() && now - cachedAt < ttlMs) return cache
        val pm = context.packageManager
        val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val list: List<AppInfo> = runCatching {
            val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.queryIntentActivities(main, PackageManager.ResolveInfoFlags.of(0L))
            } else {
                @Suppress("DEPRECATION") pm.queryIntentActivities(main, 0)
            }
            resolved.mapNotNull { ri ->
                runCatching {
                    AppInfo(
                        ri.activityInfo.packageName,
                        ri.loadLabel(pm).toString()
                    )
                }.getOrNull()
            }.distinctBy { it.packageName }
        }.getOrElse {
            JarvisLog.w("launcher query failed (missing QUERY_ALL_PACKAGES?)", it)
            emptyList()
        }
        cache = list
        cachedAt = now
        return list
    }

    private fun match(query: String): AppInfo? {
        val q = TextNorm.normalize(query).removeSuffix("app").trim()
        val apps = catalog()

        // 1. exact/contains label match
        apps.firstOrNull { TextNorm.normalize(it.label) == q }?.let { return it }
        apps.firstOrNull { TextNorm.normalize(it.label).contains(q) && q.length >= 3 }?.let { return it }

        // 2. well-known alias table (tri-lingual)
        val aliasHit = Lexicon.appAliases.entries
            .firstOrNull { (display, aliases) -> aliases.any { a -> q.contains(a) || a.contains(q) && q.length >= 4 } }
            ?.key
        if (aliasHit != null) {
            apps.firstOrNull { TextNorm.normalize(it.label) == TextNorm.normalize(aliasHit) }?.let { return it }
            wellKnown[aliasHit.lowercase()]?.let { pkg ->
                apps.firstOrNull { it.packageName == pkg }?.let { return it }
                return AppInfo(pkg, aliasHit)
            }
        }

        // 3. raw English words → wellKnown map
        wellKnown.keys.firstOrNull { q.contains(it) }?.let { key ->
            val pkg = wellKnown[key]!!
            return AppInfo(pkg, key.replaceFirstChar { c -> c.uppercase() })
        }
        // 4. user-memorised alias: "remember my editor is VS Code"
        memory.all().facts["app:${q}"]?.let { pkg -> return AppInfo(pkg, q) }
        return null
    }

    fun open(name: String): ExecOutcome {
        val info = match(name) ?: return ExecOutcome(
            false, I18n.notFound("en", "an app called '$name'") +
                " — try the exact name from the launcher."
        )
        val pm = context.packageManager
        val launch = runCatching { pm.getLaunchIntentForPackage(info.packageName) }.getOrNull()
            ?: Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .setClassName(info.packageName, info.packageName)
        return runCatching {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
            context.startActivity(launch)
            ExecOutcome(true, "Opening ${info.label}")
        }.getOrElse {
            JarvisLog.w("launch failed for ${info.packageName}", it)
            ExecOutcome(false, "${info.label} could not be opened (it may be disabled)")
        }
    }

    /**
     * Android forbids third-party "force-stop" of other apps.
     * Best compliant UX: background the app (go home) so it's out of sight.
     */
    fun close(name: String): ExecOutcome {
        val info = match(name)
        return ExecOutcome(
            true,
            buildString {
                append("I can't force-close ${info?.label ?: "the app"} — Android security prevents that. ")
                append("Pressing Home instead; swipe it away in Recents for a full stop.")
            }
        ).also { goHome() }
    }

    private fun goHome() {
        runCatching {
            val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(home)
        }
    }

    fun appExists(query: String): Boolean = match(query) != null
}

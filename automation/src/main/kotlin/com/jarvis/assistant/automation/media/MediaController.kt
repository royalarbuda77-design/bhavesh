package com.jarvis.assistant.automation.media

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.view.KeyEvent
import com.jarvis.assistant.automation.I18n
import com.jarvis.assistant.automation.system.ExecOutcome
import com.jarvis.assistant.core.log.JarvisLog
import java.net.URLEncoder

/**
 * Playback control without any account permission:
 *  • play/pause/next/prev are routed through global media keys, so whichever
 *    app holds the media session (YouTube Music, Spotify, JioSaavn, local…)
 *    obeys them.
 *  • "play X on YouTube/Spotify" deep-links the query straight into the app
 *    (search or watch page — autoplay from search is the app's own policy).
 */
class MediaController(private val context: Context) {

    private val audioManager: AudioManager?
        get() = runCatching { context.getSystemService(AudioManager::class.java) }.getOrNull()

    fun sendKey(keyCode: Int): ExecOutcome {
        val am = audioManager ?: return ExecOutcome(false, "Audio system unavailable")
        return runCatching {
            val eventTime = System.uptimeMillis()
            am.dispatchMediaKeyEvent(KeyEvent(eventTime, eventTime, keyCode, 0, 0))
            am.dispatchMediaKeyEvent(KeyEvent(eventTime, eventTime, keyCode, 0, 1))
            ExecOutcome(true, when (keyCode) {
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "Toggled playback"
                KeyEvent.KEYCODE_MEDIA_NEXT -> "Next track"
                KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "Previous track"
                KeyEvent.KEYCODE_MEDIA_STOP -> "Stopped"
                else -> "Done"
            })
        }.getOrElse {
            JarvisLog.w("media key failed", it)
            ExecOutcome(false, "No media session is currently active")
        }
    }

    fun play(): ExecOutcome = sendKey(KeyEvent.KEYCODE_MEDIA_PLAY)
    fun pause(): ExecOutcome = sendKey(KeyEvent.KEYCODE_MEDIA_PAUSE)
    fun next(): ExecOutcome = sendKey(KeyEvent.KEYCODE_MEDIA_NEXT)
    fun prev(): ExecOutcome = sendKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS)

    fun volumeUp(): ExecOutcome = adjustVolume(+1)
    fun volumeDown(): ExecOutcome = adjustVolume(-1)

    private fun adjustVolume(direction: Int): ExecOutcome {
        val am = audioManager ?: return ExecOutcome(false, "Audio system unavailable")
        return runCatching {
            am.adjustStreamVolume(
                AudioManager.STREAM_MUSIC,
                if (direction > 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER,
                0
            )
            ExecOutcome(true, if (direction > 0) "Volume up" else "Volume down")
        }.getOrElse { ExecOutcome(false, "Could not change volume") }
    }

    /**
     * @param service "youtube" | "spotify" | "any"
     * @param query   song / playlist / channel search text (may be null → resume)
     */
    fun playQuery(service: String, query: String?): ExecOutcome {
        if (query.isNullOrBlank()) {
            return when (service.lowercase()) {
                "youtube" -> openYouTube(null)
                "spotify" -> launchPackage("com.spotify.music", "Spotify")
                else -> play()
            }
        }
        return when (service.lowercase()) {
            "youtube" -> openYouTube(query)
            "spotify" -> openSpotify(query)
            "radio" -> openYouTube(query)
            else -> {
                // "any": resume an active media session; if none, search YouTube
                val outcome = play()
                if (outcome.ok) outcome else openYouTube(query)
            }
        }
    }

    private fun openYouTube(query: String?): ExecOutcome {
        val url = if (query == null) {
            "https://www.youtube.com"
        } else if (query.startsWith("http")) {
            query
        } else {
            "https://www.youtube.com/results?search_query=" +
                URLEncoder.encode(query, "UTF-8")
        }
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            setPackage("com.google.android.youtube")
        }
        val direct = runCatching { context.startActivity(intent); true }.getOrDefault(false)
        if (direct) return ExecOutcome(true, "Playing '$query' on YouTube")
        // fall back to browser
        val browser = runCatching {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            true
        }.getOrDefault(false)
        return ExecOutcome(
            browser,
            if (browser) "YouTube app not found — opening in browser" else I18n.notFound("en", "YouTube")
        )
    }

    private fun openSpotify(query: String): ExecOutcome {
        val ok = launchPackage("com.spotify.music", "Spotify", "spotify:search:${Uri.encode(query)}")
        return if (ok) ExecOutcome(true, "Searching '$query' in Spotify — tap play on the top result")
        else ExecOutcome(false, I18n.notFound("en", "Spotify"))
    }

    private fun launchPackage(pkg: String, label: String, data: String? = null): Boolean = runCatching {
        val intent = context.packageManager.getLaunchIntentForPackage(pkg)
            ?: Intent(Intent.ACTION_VIEW).apply { setClassName(pkg, "$pkg.MainActivity") }
        if (data != null) intent.data = Uri.parse(data)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
    }.getOrElse {
        JarvisLog.w("$pkg launch failed", it)
        false
    }

}

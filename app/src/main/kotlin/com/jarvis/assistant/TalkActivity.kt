package com.jarvis.assistant

import android.app.Activity
import android.os.Bundle
import com.jarvis.assistant.service.JarvisService

/**
 * Invisible launcher entry for the widget / notification shortcuts:
 * boots the service if needed and immediately opens a push-to-talk session.
 */
class TalkActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!JarvisService.isRunning) {
            JarvisService.send(this, JarvisService.ACTION_START)
        }
        JarvisService.send(this, JarvisService.ACTION_TALK)
        overridePendingTransitionSafely()
        finish()
    }

    private fun overridePendingTransitionSafely() {
        runCatching { overridePendingTransition(0, 0) }
    }
}

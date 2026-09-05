package com.jarvis.assistant.core.util

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

/**
 * Decouples "I need a runtime permission" raised from any background engine
 * from the Activity that actually owns the request launcher. MainActivity
 * collects [pending] and calls ActivityCompat.requestPermissions.
 */
object PermissionRequests {

    private val _pending = MutableSharedFlow<Array<String>>(
        replay = 0, extraBufferCapacity = 4, onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val pending: SharedFlow<Array<String>> = _pending

    fun request(vararg permissions: String) {
        if (permissions.isNotEmpty()) _pending.tryEmit(arrayOf(*permissions))
    }
}

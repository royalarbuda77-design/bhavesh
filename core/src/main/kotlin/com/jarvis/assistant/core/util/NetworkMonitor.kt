package com.jarvis.assistant.core.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.conflate

/** Reactive internet availability — offline-mode switching + UI badge. */
class NetworkMonitor(context: Context) {

    private val cm = context.applicationContext.getSystemService(ConnectivityManager::class.java)

    fun isOnline(): Boolean = runCatching {
        val n = cm?.activeNetwork ?: return@runCatching false
        val caps = cm.getNetworkCapabilities(n) ?: return@runCatching false
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }.getOrDefault(false)

    fun isMetered(): Boolean = runCatching {
        val caps = cm?.activeNetwork?.let { cm.getNetworkCapabilities(it) }
        caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
    }.getOrDefault(true)

    /** Emits online/offline transitions (initial emission = current state). */
    fun onlineFlow(): Flow<Boolean> = callbackFlow {
        trySend(isOnline())
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(true) }
            override fun onLost(network: Network) { trySend(isOnline()) }
            override fun onCapabilitiesChanged(
                network: Network,
                networkCapabilities: NetworkCapabilities
            ) {
                trySend(networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))
            }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        cm?.registerNetworkCallback(request, cb)
        awaitClose { runCatching { cm?.unregisterNetworkCallback(cb) } }
    }.conflate()
}

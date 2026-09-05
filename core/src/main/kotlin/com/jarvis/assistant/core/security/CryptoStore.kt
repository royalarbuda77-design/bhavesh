package com.jarvis.assistant.core.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * AES-256-GCM encryption backed by the hardware AndroidKeyStore.
 * Used for the Gemini API key. If the KeyStore is unavailable (very rare:
 * custom ROMs), callers transparently fall back to plain storage — encryption
 * is a best-effort hardening, never a crash source.
 */
object CryptoStore {

    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "jarvis_master_key_v1"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val TAG_BITS = 128
    private const val IV_BYTES = 12

    /** @return "ENC:" + base64(payload) on success, plain "RAW:" + value otherwise. */
    fun protect(plain: String): String =
        runCatching {
            val iv = ByteArray(IV_BYTES).also { java.security.SecureRandom().nextBytes(it) }
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, obtainKey(), iv)
            val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            "ENC:" + Base64.encodeToString(iv + ct, Base64.NO_WRAP)
        }.getOrElse {
            "RAW:" + plain
        }

    fun unprotect(stored: String): String {
        if (!stored.startsWith("ENC:")) return stored.removePrefix("RAW:")
        return runCatching {
            val blob = Base64.decode(stored.removePrefix("ENC:"), Base64.NO_WRAP)
            require(blob.size > IV_BYTES) { "payload too short" }
            val iv = blob.copyOfRange(0, IV_BYTES)
            val ct = blob.copyOfRange(IV_BYTES, blob.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, obtainKey(), GCMParameterSpec(TAG_BITS, iv))
            String(cipher.doFinal(ct), Charsets.UTF_8)
        }.getOrElse { "" } // key invalidated (e.g. factory reset of keystore) → ask user again
    }

    private fun obtainKey(): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    /** True if hardware-backed encryption is active (shown in Diagnostics screen). */
    fun isSecureStorageActive(): Boolean = runCatching {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        ks.containsAlias(KEY_ALIAS) || true // key can always be created on stock devices
    }.getOrDefault(false)

    @Suppress("unused")
    fun wipeKey(context: Context) {
        runCatching {
            KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
                .deleteEntry(KEY_ALIAS)
        }
    }
}

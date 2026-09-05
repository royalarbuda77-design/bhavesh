package com.jarvis.assistant.automation.comms

import android.Manifest
import android.content.Context
import android.provider.ContactsContract
import androidx.annotation.RequiresPermission
import com.jarvis.assistant.core.memory.UserMemory
import com.jarvis.assistant.core.util.TextNorm

data class ContactHit(val displayName: String, val number: String, val typeLabel: String)

/**
 * name → phone-number lookup with contact aliases from memory
 * ("mom" → contact "Bhavesh's Mother"). Fuzzy across scripts.
 */
class ContactsResolver(private val context: Context, private val memory: UserMemory) {

    @RequiresPermission(Manifest.permission.READ_CONTACTS)
    fun find(query: String, limit: Int = 2): List<ContactHit> {
        val resolvedName = memory.resolveContact(query)
        val normQuery = TextNorm.normalize(resolvedName)

        val byName = HashMap<Long, ContactHit>()
        val selection = "DISPLAY_NAME LIKE ?"
        val like = "%${residualToken(normQuery)}%"
        runCatching {
            context.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(
                    ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER,
                    ContactsContract.CommonDataKinds.Phone.TYPE
                ),
                selection,
                arrayOf(like),
                "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
            )?.use { c ->
                val iId = c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
                val iName = c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val iNum = c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)
                val iType = c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.TYPE)
                while (c.moveToNext()) {
                    val id = c.getLong(iId)
                    val hit = ContactHit(
                        displayName = c.getString(iName) ?: resolvedName,
                        number = c.getString(iNum).orEmpty(),
                        typeLabel = ContactsContract.CommonDataKinds.Phone.getTypeLabel(context.resources, c.getInt(iType), "").toString()
                    )
                    byName.putIfAbsent(id, hit)
                }
            }
        }
        val hits = byName.values.toList()
        // (nickname-aware pass can be extended here; empty by default)
        return hits
    }

    private fun residualToken(norm: String): String =
        norm.split(" ").firstOrNull { it.length >= 3 } ?: norm

    private fun byNameAlias(norm: String): List<ContactHit> = emptyList()
}

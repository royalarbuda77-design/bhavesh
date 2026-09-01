package com.bhavesh.remindly.data

import kotlinx.coroutines.flow.Flow

class ReminderRepository(private val dao: ReminderDao) {
    val reminders: Flow<List<ReminderEntity>> = dao.observeAll()
    fun reminder(id: Long): Flow<ReminderEntity?> = dao.observeById(id)
    fun remindersForDate(epochDay: Long): Flow<List<ReminderEntity>> = dao.observeForDate(epochDay)
    suspend fun getAll() = dao.getAll()
    suspend fun get(id: Long) = dao.getById(id)
    suspend fun active() = dao.getActive()
    suspend fun insert(item: ReminderEntity) = dao.insert(item)
    suspend fun update(item: ReminderEntity) = dao.update(item)
    suspend fun delete(item: ReminderEntity) = dao.delete(item)
    suspend fun deleteCompleted() = dao.deleteCompleted()
}

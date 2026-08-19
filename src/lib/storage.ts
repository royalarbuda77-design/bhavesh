import { DBSchema, IDBPDatabase, openDB } from 'idb'
import { DEFAULT_SETTINGS, type DocumentMeta, type StudyDocument } from '../types'

interface StudyBoardDB extends DBSchema {
  documents: {
    key: string
    value: StudyDocument
    indexes: { 'by-updated': number }
  }
  metadata: {
    key: string
    value: DocumentMeta
    indexes: { 'by-updated': number }
  }
}

let dbPromise: Promise<IDBPDatabase<StudyBoardDB>> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB<StudyBoardDB>('smart-study-board', 1, {
      upgrade(database) {
        const documents = database.createObjectStore('documents', { keyPath: 'id' })
        documents.createIndex('by-updated', 'updatedAt')
        const metadata = database.createObjectStore('metadata', { keyPath: 'id' })
        metadata.createIndex('by-updated', 'updatedAt')
      }
    })
  }
  return dbPromise
}

function toMeta(document: StudyDocument): DocumentMeta {
  return {
    id: document.id,
    name: document.name,
    type: document.type,
    pageCount: document.pages.length,
    updatedAt: document.updatedAt,
    createdAt: document.createdAt
  }
}

export async function saveDocument(document: StudyDocument) {
  const database = await db()
  const transaction = database.transaction(['documents', 'metadata'], 'readwrite')
  await Promise.all([
    transaction.objectStore('documents').put(document),
    transaction.objectStore('metadata').put(toMeta(document)),
    transaction.done
  ])
}

export async function getDocument(id: string) {
  const document = await (await db()).get('documents', id)
  if (document) {
    const needsAccurateAreaEraserMigration = !document.settings.eraserAreaV2
    document.settings = { ...structuredClone(DEFAULT_SETTINGS), ...document.settings }
    if (needsAccurateAreaEraserMigration) {
      document.settings.eraserMode = 'area'
      document.settings.eraserAreaV2 = true
    }
  }
  return document
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  const all = await (await db()).getAllFromIndex('metadata', 'by-updated')
  return all.reverse()
}

export async function deleteDocument(id: string) {
  const database = await db()
  const transaction = database.transaction(['documents', 'metadata'], 'readwrite')
  await Promise.all([
    transaction.objectStore('documents').delete(id),
    transaction.objectStore('metadata').delete(id),
    transaction.done
  ])
}

export async function renameDocument(id: string, name: string) {
  const document = await getDocument(id)
  if (!document) throw new Error('Document not found')
  document.name = name.trim() || document.name
  document.updatedAt = Date.now()
  await saveDocument(document)
}

export function storageErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/quota|space|storage/i.test(message)) {
    return 'Local storage is full. Export or delete older documents and try again. / સ્ટોરેજ ભરાઈ ગયું છે.'
  }
  return 'Unable to save locally. Keep this tab open and export a backup. / લોકલી સેવ થઈ શક્યું નથી.'
}

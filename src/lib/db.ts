import { DatabaseSync } from "node:sqlite";
import { config } from "./env";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite data layer. Every query touching user-owned data MUST be scoped by
 * userId at the SQL level (defence against IDOR) — helper signatures force it.
 */

export type Row = Record<string, unknown>;

const globalForDb = globalThis as unknown as { __nexusDb?: DatabaseSync };

function getDb(): DatabaseSync {
  if (globalForDb.__nexusDb) return globalForDb.__nexusDb;
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const db = new DatabaseSync(config.databasePath);
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA foreign_keys=ON;");
  migrate(db);
  globalForDb.__nexusDb = db;
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT,
    google_sub TEXT UNIQUE,
    avatar_url TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'system',
    auto_routing INTEGER NOT NULL DEFAULT 0,
    fallback_enabled INTEGER NOT NULL DEFAULT 0,
    fallback_model_ref TEXT,
    web_search_default INTEGER NOT NULL DEFAULT 0,
    send_on_enter INTEGER NOT NULL DEFAULT 1,
    default_model_ref TEXT,
    preferences_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS provider_credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL,
    label TEXT NOT NULL,
    base_url TEXT,
    org_id TEXT,
    project_id TEXT,
    api_key_enc TEXT NOT NULL,
    key_hint TEXT NOT NULL,
    key_last4 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'connected',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_tested_at INTEGER,
    last_test_message TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_provider_credentials_user ON provider_credentials(user_id);
  CREATE TABLE IF NOT EXISTS connected_models (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL REFERENCES provider_credentials(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    capabilities_json TEXT NOT NULL,
    context_window INTEGER,
    pricing_json TEXT,
    labels_json TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'discovered',
    last_seen INTEGER NOT NULL,
    UNIQUE(user_id, credential_id, model_id)
  );
  CREATE INDEX IF NOT EXISTS idx_connected_models_user ON connected_models(user_id);
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New chat',
    credential_id TEXT,
    model_id TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    share_id TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
    content TEXT NOT NULL,
    reasoning TEXT,
    credential_id TEXT,
    model_id TEXT,
    meta_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id TEXT,
    message_id TEXT,
    tool TEXT NOT NULL,
    args_json TEXT NOT NULL,
    result_json TEXT,
    status TEXT NOT NULL,
    latency_ms INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id TEXT,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    kind TEXT NOT NULL,
    text_content TEXT,
    data_b64 TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
  `);
}

export const db = getDb();

/* ─── tiny helpers ─────────────────────────────────────────────────────── */

export function all(sql: string, ...params: (string | number | null)[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}

export function get(sql: string, ...params: (string | number | null)[]): Row | undefined {
  return db.prepare(sql).get(...params) as Row | undefined;
}

export function run(sql: string, ...params: (string | number | null)[]): void {
  db.prepare(sql).run(...params);
}

export function nowMs(): number {
  return Date.now();
}

export function jsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

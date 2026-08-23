import { all, get, run, nowMs, jsonParse } from "./db";

/** Conversation & message persistence. Everything is scoped by userId. */

export type MessageMeta = {
  attachments?: { id: string; filename: string; kind: string }[];
  sources?: { title: string; url: string; snippet: string }[];
  toolCalls?: { name: string; ok: boolean | null; summary: string }[];
  usage?: { inputTokens?: number; outputTokens?: number };
  notices?: string[];
  feedback?: 1 | -1 | 0;
  aborted?: boolean;
  error?: string;
  model?: string;
  provider?: string;
  latencyMs?: number;
};

export type MessageDTO = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  reasoning: string | null;
  modelId: string | null;
  credentialId: string | null;
  meta: MessageMeta;
  createdAt: number;
};

export type ConversationDTO = {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  shareId: string | null;
  credentialId: string | null;
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
};

export function rowToConversation(r: Record<string, unknown>): ConversationDTO {
  return {
    id: String(r.id),
    title: String(r.title),
    pinned: Number(r.pinned) === 1,
    archived: Number(r.archived) === 1,
    shareId: r.share_id ? String(r.share_id) : null,
    credentialId: r.credential_id ? String(r.credential_id) : null,
    modelId: r.model_id ? String(r.model_id) : null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function rowToMessage(r: Record<string, unknown>): MessageDTO {
  return {
    id: String(r.id),
    conversationId: String(r.conversation_id),
    role: r.role === "assistant" ? "assistant" : "user",
    content: String(r.content),
    reasoning: r.reasoning ? String(r.reasoning) : null,
    modelId: r.model_id ? String(r.model_id) : null,
    credentialId: r.credential_id ? String(r.credential_id) : null,
    meta: jsonParse<MessageMeta>(r.meta_json, {}),
    createdAt: Number(r.created_at),
  };
}

export function listConversations(userId: string, opts: { q?: string; archived?: boolean } = {}): ConversationDTO[] {
  const q = (opts.q ?? "").trim();
  if (q) {
    return all(
      `SELECT DISTINCT c.* FROM conversations c
       JOIN messages m ON m.conversation_id = c.id
       WHERE c.user_id = ? AND c.archived = ? AND (c.title LIKE ? OR m.content LIKE ?)
       ORDER BY c.pinned DESC, c.updated_at DESC LIMIT 100`,
      userId,
      opts.archived ? 1 : 0,
      `%${q}%`,
      `%${q}%`
    ).map(rowToConversation);
  }
  return all(
    "SELECT * FROM conversations WHERE user_id = ? AND archived = ? ORDER BY pinned DESC, updated_at DESC LIMIT 200",
    userId,
    opts.archived ? 1 : 0
  ).map(rowToConversation);
}

export function getConversation(userId: string, id: string): ConversationDTO | null {
  const row = get("SELECT * FROM conversations WHERE id = ? AND user_id = ?", id, userId);
  return row ? rowToConversation(row) : null;
}

export function createConversation(userId: string, title = "New chat"): ConversationDTO {
  const id = crypto.randomUUID();
  const ts = nowMs();
  run("INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?,?,?,?,?)", id, userId, title.slice(0, 120) || "New chat", ts, ts);
  return getConversation(userId, id)!;
}

export function updateConversation(
  userId: string,
  id: string,
  patch: { title?: string; pinned?: boolean; archived?: boolean }
): ConversationDTO | null {
  const existing = getConversation(userId, id);
  if (!existing) return null;
  const title = patch.title !== undefined ? patch.title.slice(0, 120) || "Untitled" : existing.title;
  const pinned = patch.pinned !== undefined ? (patch.pinned ? 1 : 0) : existing.pinned ? 1 : 0;
  const archived = patch.archived !== undefined ? (patch.archived ? 1 : 0) : existing.archived ? 1 : 0;
  run("UPDATE conversations SET title=?, pinned=?, archived=?, updated_at=? WHERE id=? AND user_id=?", title, pinned, archived, nowMs(), id, userId);
  return getConversation(userId, id);
}

export function deleteConversation(userId: string, id: string): boolean {
  const existing = getConversation(userId, id);
  if (!existing) return false;
  run("DELETE FROM conversations WHERE id = ? AND user_id = ?", id, userId);
  return true;
}

export function setShareId(userId: string, id: string, shareId: string | null): ConversationDTO | null {
  const existing = getConversation(userId, id);
  if (!existing) return null;
  run("UPDATE conversations SET share_id=? WHERE id=? AND user_id=?", shareId, id, userId);
  return getConversation(userId, id);
}

export function getConversationByShareId(shareId: string): ConversationDTO | null {
  const row = get("SELECT * FROM conversations WHERE share_id = ?", shareId);
  return row ? rowToConversation(row) : null;
}

export function listMessages(userId: string, conversationId: string): MessageDTO[] {
  return all(
    "SELECT * FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 500",
    conversationId,
    userId
  ).map(rowToMessage);
}

export function appendMessage(
  userId: string,
  conversationId: string,
  msg: { role: "user" | "assistant"; content: string; reasoning?: string | null; modelId?: string | null; credentialId?: string | null; meta?: MessageMeta }
): MessageDTO {
  const id = crypto.randomUUID();
  run(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, reasoning, credential_id, model_id, meta_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    id,
    conversationId,
    userId,
    msg.role,
    msg.content,
    msg.reasoning ?? null,
    msg.credentialId ?? null,
    msg.modelId ?? null,
    JSON.stringify(msg.meta ?? {}),
    nowMs()
  );
  run("UPDATE conversations SET updated_at=? WHERE id=?", nowMs(), conversationId);
  const row = get("SELECT * FROM messages WHERE id = ?", id)!;
  return rowToMessage(row);
}

export function setMessageFeedback(userId: string, messageId: string, feedback: 1 | -1 | 0): MessageDTO | null {
  const row = get("SELECT * FROM messages WHERE id = ? AND user_id = ?", messageId, userId);
  if (!row) return null;
  const meta = jsonParse<MessageMeta>(row.meta_json, {});
  meta.feedback = feedback;
  run("UPDATE messages SET meta_json=? WHERE id=? AND user_id=?", JSON.stringify(meta), messageId, userId);
  return rowToMessage(get("SELECT * FROM messages WHERE id = ?", messageId)!);
}

export function deleteTrailingAssistantMessages(userId: string, conversationId: string): number {
  const msgs = listMessages(userId, conversationId);
  let deleted = 0;
  for (let i = msgs.length - 1; i >= 0 && msgs[i].role === "assistant"; i--) {
    run("DELETE FROM messages WHERE id = ? AND user_id = ?", msgs[i].id, userId);
    deleted++;
  }
  return deleted;
}

export function countUserConversations(userId: string): number {
  const row = get("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?", userId);
  return Number(row?.n ?? 0);
}

export function deleteAllConversations(userId: string): void {
  run("DELETE FROM conversations WHERE user_id = ?", userId);
}

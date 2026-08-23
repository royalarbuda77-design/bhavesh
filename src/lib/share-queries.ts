import { all } from "./db";
import { jsonParse } from "./db";
import type { MessageMeta } from "./conversations";

/** Public share view: reads messages by conversation id only (no user scope needed — the share token is the capability). */
export function listMessagesByShare(conversationId: string) {
  return all("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 500", conversationId).map((r) => ({
    id: String(r.id),
    role: r.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: String(r.content),
    modelId: r.model_id ? String(r.model_id) : null,
    meta: jsonParse<MessageMeta>(r.meta_json, {}),
  }));
}

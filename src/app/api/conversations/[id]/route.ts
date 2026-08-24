import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/api";
import { deleteConversation, getConversation, listMessages, updateConversation } from "@/lib/conversations";

export const GET = withAuth(async ({ user, params }) => {
  const conversation = getConversation(user.id, params.id);
  if (!conversation) throw new ApiError(404, "not_found", "Conversation not found.");
  return NextResponse.json({ conversation, messages: listMessages(user.id, conversation.id) });
});

export const PATCH = withAuth(async ({ user, params, req }) => {
  const body = await readJson<{ title?: string; pinned?: boolean; archived?: boolean }>(req);
  const updated = updateConversation(user.id, params.id, body);
  if (!updated) throw new ApiError(404, "not_found", "Conversation not found.");
  return NextResponse.json({ conversation: updated });
});

export const DELETE = withAuth(async ({ user, params }) => {
  const ok = deleteConversation(user.id, params.id);
  if (!ok) throw new ApiError(404, "not_found", "Conversation not found.");
  return NextResponse.json({ ok: true });
});

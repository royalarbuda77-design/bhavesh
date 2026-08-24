import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { getConversation, setShareId } from "@/lib/conversations";
import { randomToken } from "@/lib/crypto";
import { config } from "@/lib/env";

export const POST = withAuth(async ({ user, params }) => {
  const conversation = getConversation(user.id, params.id);
  if (!conversation) throw new ApiError(404, "not_found", "Conversation not found.");
  const shareId = conversation.shareId ?? randomToken(12);
  const updated = setShareId(user.id, params.id, shareId);
  return NextResponse.json({ conversation: updated, url: `${config.appUrl}/share/${shareId}` });
});

export const DELETE = withAuth(async ({ user, params }) => {
  const conversation = getConversation(user.id, params.id);
  if (!conversation) throw new ApiError(404, "not_found", "Conversation not found.");
  const updated = setShareId(user.id, params.id, null);
  return NextResponse.json({ conversation: updated });
});

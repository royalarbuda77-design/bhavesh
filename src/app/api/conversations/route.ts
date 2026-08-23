import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { createConversation, listConversations } from "@/lib/conversations";

export const GET = withAuth(async ({ user, req }) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const archived = url.searchParams.get("archived") === "1";
  return NextResponse.json({ conversations: listConversations(user.id, { q, archived }) });
});

export const POST = withAuth(async ({ user }) => {
  const conversation = createConversation(user.id);
  return NextResponse.json({ conversation }, { status: 201 });
});

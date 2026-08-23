import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/api";
import { setMessageFeedback } from "@/lib/conversations";

export const POST = withAuth(async ({ user, params, req }) => {
  const body = await readJson<{ value?: number }>(req);
  const value = body.value === 1 ? 1 : body.value === -1 ? -1 : 0;
  const message = setMessageFeedback(user.id, params.id, value);
  if (!message) throw new ApiError(404, "not_found", "Message not found.");
  return NextResponse.json({ message });
});

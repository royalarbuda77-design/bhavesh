import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { listFiles, processUpload } from "@/lib/files";
import { getConversation } from "@/lib/conversations";

export const GET = withAuth(async ({ user }) => {
  return NextResponse.json({ files: listFiles(user.id) });
});

/** POST /api/files — multipart upload (validated by magic bytes server-side). */
export const POST = withAuth(
  async ({ user, req }) => {
    const form = await req.formData().catch(() => null);
    if (!form) throw new ApiError(400, "invalid_form", "Expected multipart/form-data.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "missing_file", "No file provided.");
    const conversationId = form.get("conversationId");
    const convoId = typeof conversationId === "string" && conversationId ? conversationId : null;
    if (convoId && !getConversation(user.id, convoId)) throw new ApiError(404, "not_found", "Conversation not found.");
    const result = await processUpload(user.id, file, convoId);
    if (!result.ok) throw new ApiError(result.status ?? 415, "invalid_file", result.error);
    return NextResponse.json({ file: result.file }, { status: 201 });
  },
  { rateLimit: "files" }
);

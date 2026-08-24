import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { deleteFile, getFileRow } from "@/lib/files";

/** GET — file metadata (+ extracted text for documents; images excluded). */
export const GET = withAuth(async ({ user, params }) => {
  const row = getFileRow(user.id, params.id);
  if (!row) throw new ApiError(404, "not_found", "File not found.");
  return NextResponse.json({
    file: {
      id: String(row.id),
      filename: String(row.filename),
      mime: String(row.mime),
      size: Number(row.size),
      kind: String(row.kind),
      conversationId: row.conversation_id ? String(row.conversation_id) : null,
      createdAt: Number(row.created_at),
      textContent: row.kind === "image" ? null : row.text_content ? String(row.text_content).slice(0, 50_000) : null,
    },
  });
});

export const DELETE = withAuth(
  async ({ user, params }) => {
    const ok = deleteFile(user.id, params.id);
    if (!ok) throw new ApiError(404, "not_found", "File not found.");
    return NextResponse.json({ ok: true });
  },
  { rateLimit: "files" }
);

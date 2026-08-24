import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/api";
import { getUserById, run } from "@/lib/auth";

export const POST = withAuth(async ({ user, req }) => {
  const body = await readJson<{ name?: string }>(req);
  const name = (body.name ?? "").trim();
  if (name.length < 2) throw new ApiError(400, "invalid_name", "Name must be at least 2 characters.");
  const row = getUserById(user.id);
  if (!row) throw new ApiError(404, "not_found", "Account not found.");
  run("UPDATE users SET name = ? WHERE id = ?", name, user.id);
  return NextResponse.json({ ok: true, user: { ...user, name } });
});

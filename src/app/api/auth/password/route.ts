import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/api";
import { getUserById, hashPassword, verifyPassword, run } from "@/lib/auth";

export const POST = withAuth(async ({ user, req }) => {
  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(req);
  const current = body.currentPassword ?? "";
  const next = body.newPassword ?? "";
  if (next.length < 8) throw new ApiError(400, "weak_password", "New password must be at least 8 characters.");
  const row = getUserById(user.id);
  if (!row) throw new ApiError(404, "not_found", "Account not found.");
  if (row.password_hash) {
    const ok = await verifyPassword(current, String(row.password_hash));
    if (!ok) throw new ApiError(401, "invalid_credentials", "Current password is incorrect.");
  }
  run("UPDATE users SET password_hash = ? WHERE id = ?", await hashPassword(next), user.id);
  return NextResponse.json({ ok: true });
});

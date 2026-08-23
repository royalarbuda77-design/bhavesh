import { NextResponse } from "next/server";
import { withPublic, readJson, ApiError } from "@/lib/api";
import { consumePasswordResetToken, hashPassword, run } from "@/lib/auth";

export const POST = withPublic(
  async ({ req }) => {
    const body = await readJson<{ token?: string; password?: string }>(req);
    const token = (body.token ?? "").trim();
    const password = body.password ?? "";
    if (password.length < 8) throw new ApiError(400, "weak_password", "Password must be at least 8 characters.");
    if (!token) throw new ApiError(400, "missing_token", "Reset token is required.");
    const userId = consumePasswordResetToken(token);
    if (!userId) throw new ApiError(400, "invalid_token", "This reset link is invalid or has expired.");
    run("UPDATE users SET password_hash = ? WHERE id = ?", await hashPassword(password), userId);
    return NextResponse.json({ ok: true, message: "Password updated. You can now sign in." });
  },
  { rateLimit: "auth" }
);

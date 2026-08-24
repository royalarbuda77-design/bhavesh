import { NextResponse } from "next/server";
import { withPublic, readJson } from "@/lib/api";
import { findUserByEmail, createPasswordResetToken } from "@/lib/auth";
import { config } from "@/lib/env";
import { log } from "@/lib/logger";

/**
 * Password reset request. Email delivery is NOT configured in this self-hosted
 * build (no SMTP env), so the reset link is written to the server log for the
 * operator to hand to the user — stated honestly in the response and help page.
 */
export const POST = withPublic(
  async ({ req }) => {
    const body = await readJson<{ email?: string }>(req);
    const email = (body.email ?? "").trim().toLowerCase();
    const generic = { ok: true, message: "If an account exists for this email, a reset link has been issued." };
    if (!email) return NextResponse.json(generic);
    const row = findUserByEmail(email);
    if (row && row.password_hash !== null || row) {
      const token = createPasswordResetToken(String(row!.id));
      const url = `${config.appUrl}/reset-password?token=${token}`;
      log.info({ userId: String(row!.id), resetUrl: url }, "password reset requested");
    }
    return NextResponse.json(generic);
  },
  { rateLimit: "auth" }
);

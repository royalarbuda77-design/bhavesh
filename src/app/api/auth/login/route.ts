import { NextResponse } from "next/server";
import { withPublic, readJson } from "@/lib/api";
import { verifyPassword, setSessionCookie, type SessionUser } from "@/lib/auth";

export const POST = withPublic(
  async ({ req }) => {
    const body = await readJson<{ email?: string; password?: string }>(req);
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required.", code: "missing_fields" }, { status: 400 });
    }
    const { findUserByEmail, ensureSettings } = await import("@/lib/auth");
    const row = findUserByEmail(email);
    if (!row || !row.password_hash) {
      return NextResponse.json({ error: "Invalid email or password.", code: "invalid_credentials" }, { status: 401 });
    }
    const ok = await verifyPassword(password, String(row.password_hash));
    if (!ok) {
      return NextResponse.json({ error: "Invalid email or password.", code: "invalid_credentials" }, { status: 401 });
    }
    ensureSettings(String(row.id));
    const user: SessionUser = { id: String(row.id), email: String(row.email), name: String(row.name), avatarUrl: row.avatar_url ? String(row.avatar_url) : null };
    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
    await setSessionCookie(res, user);
    return res;
  },
  { rateLimit: "auth" }
);

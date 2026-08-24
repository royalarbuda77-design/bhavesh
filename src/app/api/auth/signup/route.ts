import { NextResponse } from "next/server";
import { withPublic, readJson } from "@/lib/api";
import { createUser, findUserByEmail, hashPassword, setSessionCookie } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withPublic(
  async ({ req }) => {
    const body = await readJson<{ name?: string; email?: string; password?: string }>(req);
    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    if (name.length < 2) return NextResponse.json({ error: "Please enter your name (at least 2 characters).", code: "invalid_name" }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Please enter a valid email address.", code: "invalid_email" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters.", code: "weak_password" }, { status: 400 });

    if (findUserByEmail(email)) {
      return NextResponse.json({ error: "An account with this email already exists.", code: "email_taken" }, { status: 409 });
    }
    const user = createUser({ email, name, passwordHash: await hashPassword(password) });
    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
    await setSessionCookie(res, user, { request: req });
    return res;
  },
  { rateLimit: "auth" }
);

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { config } from "@/lib/env";
import {
  createUser,
  findUserByEmail,
  findUserByGoogleSub,
  setSessionCookie,
  ensureSettings,
  run,
  type SessionUser,
} from "@/lib/auth";
import { log } from "@/lib/logger";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get("google_oauth_state")?.value;
  store.delete("google_oauth_state");

  if (!config.google.enabled) return NextResponse.redirect(new URL("/login?error=google_not_configured", req.url));
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/login?error=oauth_state", req.url));
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: `${config.appUrl}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`);
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) throw new Error("no access token");

    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!infoRes.ok) throw new Error(`userinfo failed (${infoRes.status})`);
    const info = (await infoRes.json()) as { sub?: string; email?: string; name?: string; picture?: string };
    if (!info.sub || !info.email) throw new Error("incomplete profile");

    type UserRow = { id: string; email: string; name: string };
    let row: UserRow | undefined = findUserByGoogleSub(info.sub) as UserRow | undefined;
    if (!row) {
      const byEmail = findUserByEmail(info.email) as UserRow | undefined;
      if (byEmail) {
        run("UPDATE users SET google_sub=?, avatar_url=COALESCE(?, avatar_url) WHERE id=?", info.sub, info.picture ?? null, byEmail.id);
        row = findUserByEmail(info.email) as UserRow | undefined;
      } else {
        const user = createUser({
          email: info.email,
          name: info.name || info.email.split("@")[0],
          passwordHash: null,
          googleSub: info.sub,
          avatarUrl: info.picture ?? null,
        });
        row = { id: user.id, email: user.email, name: user.name };
      }
    }
    if (!row) throw new Error("could not create user account");
    ensureSettings(String(row.id));
    const user: SessionUser = { id: String(row.id), email: String(row.email), name: String(row.name), avatarUrl: (info.picture as string) ?? null };
    const res = NextResponse.redirect(new URL("/chat", req.url));
    await setSessionCookie(res, user, { request: req });
    return res;
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "google oauth failed");
    return NextResponse.redirect(new URL("/login?error=google_failed", req.url));
  }
}

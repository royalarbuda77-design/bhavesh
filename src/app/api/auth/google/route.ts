import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { config } from "@/lib/env";
import { randomToken } from "@/lib/crypto";

/** Starts the Google OAuth flow (only when GOOGLE_CLIENT_ID/SECRET are set). */
export async function GET(req: Request) {
  if (!config.google.enabled) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", req.url));
  }
  const state = randomToken(16);
  const store = await cookies();
  store.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
    maxAge: 600,
  });
  const redirectUri = `${config.appUrl}/api/auth/google/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", config.google.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(authUrl.toString());
}

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { config } from "./env";
import { all, get, run, nowMs } from "./db";
import { sha256 } from "./crypto";

export type SessionUser = { id: string; email: string; name: string; avatarUrl: string | null };

export type UserSettings = {
  theme: "light" | "dark" | "system";
  autoRouting: boolean;
  fallbackEnabled: boolean;
  fallbackModelRef: string | null;
  webSearchDefault: boolean;
  sendOnEnter: boolean;
  defaultModelRef: string | null;
};

const encoder = new TextEncoder();
const secretKey = () => encoder.encode(config.authSecret);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${config.sessionTtlSeconds}s`)
    .sign(secretKey());
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      avatarUrl: null,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(response: Response, user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const res = response as Response & { cookies?: { set: (opts: Record<string, unknown>) => void } };
  // NextResponse/NextServerResponse both expose .cookies.set
  if (res.cookies) {
    res.cookies.set({
      name: config.sessionCookie,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProd,
      path: "/",
      maxAge: config.sessionTtlSeconds,
    });
  } else {
    response.headers.append(
      "Set-Cookie",
      `${config.sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${config.sessionTtlSeconds}${config.isProd ? "; Secure" : ""}`
    );
  }
}

export function clearSessionCookie(response: Response): void {
  const res = response as Response & { cookies?: { set: (opts: Record<string, unknown>) => void } };
  if (res.cookies) {
    res.cookies.set({ name: config.sessionCookie, value: "", httpOnly: true, path: "/", maxAge: 0 });
  } else {
    response.headers.append("Set-Cookie", `${config.sessionCookie}=; Path=/; HttpOnly; Max-Age=0`);
  }
}

/** Returns the authenticated user (verified against DB) or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(config.sessionCookie)?.value;
  if (!token) return null;
  const session = await readSessionToken(token);
  if (!session) return null;
  const row = get("SELECT id, email, name, avatar_url FROM users WHERE id = ?", session.id);
  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
  };
}

/* ─── user management ───────────────────────────────────────────────────── */

export function createUser(input: {
  email: string;
  name: string;
  passwordHash: string | null;
  googleSub?: string | null;
  avatarUrl?: string | null;
}): SessionUser {
  const id = crypto.randomUUID();
  run(
    "INSERT INTO users (id, email, name, password_hash, google_sub, avatar_url, created_at) VALUES (?,?,?,?,?,?,?)",
    id,
    input.email.trim().toLowerCase(),
    input.name.trim(),
    input.passwordHash,
    input.googleSub ?? null,
    input.avatarUrl ?? null,
    nowMs()
  );
  ensureSettings(id);
  return { id, email: input.email.trim().toLowerCase(), name: input.name.trim(), avatarUrl: input.avatarUrl ?? null };
}

export function findUserByEmail(email: string) {
  return get("SELECT * FROM users WHERE email = ?", email.trim().toLowerCase());
}

export function findUserByGoogleSub(sub: string) {
  return get("SELECT * FROM users WHERE google_sub = ?", sub);
}

export function getUserById(id: string) {
  return get("SELECT * FROM users WHERE id = ?", id);
}

export function ensureSettings(userId: string): void {
  const existing = get("SELECT user_id FROM user_settings WHERE user_id = ?", userId);
  if (!existing) run("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)", userId);
}

export function getSettings(userId: string): UserSettings {
  ensureSettings(userId);
  const row = get("SELECT * FROM user_settings WHERE user_id = ?", userId)!;
  return {
    theme: (["light", "dark", "system"].includes(String(row.theme)) ? row.theme : "system") as UserSettings["theme"],
    autoRouting: Number(row.auto_routing) === 1,
    fallbackEnabled: Number(row.fallback_enabled) === 1,
    fallbackModelRef: row.fallback_model_ref ? String(row.fallback_model_ref) : null,
    webSearchDefault: Number(row.web_search_default) === 1,
    sendOnEnter: Number(row.send_on_enter) === 1,
    defaultModelRef: row.default_model_ref ? String(row.default_model_ref) : null,
  };
}

export function updateSettings(userId: string, patch: Partial<UserSettings>): UserSettings {
  ensureSettings(userId);
  const current = getSettings(userId);
  const next = { ...current, ...patch };
  run(
    `UPDATE user_settings SET theme=?, auto_routing=?, fallback_enabled=?, fallback_model_ref=?, web_search_default=?, send_on_enter=?, default_model_ref=? WHERE user_id=?`,
    next.theme,
    next.autoRouting ? 1 : 0,
    next.fallbackEnabled ? 1 : 0,
    next.fallbackModelRef ?? null,
    next.webSearchDefault ? 1 : 0,
    next.sendOnEnter ? 1 : 0,
    next.defaultModelRef ?? null,
    userId
  );
  return next;
}

/* ─── password reset tokens ─────────────────────────────────────────────── */

export function createPasswordResetToken(userId: string, ttlMs = 30 * 60 * 1000): string {
  const token = crypto.randomBytes(32).toString("base64url");
  run(
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used, created_at) VALUES (?,?,?,?,0,?)",
    crypto.randomUUID(),
    userId,
    sha256(token),
    nowMs() + ttlMs,
    nowMs()
  );
  return token;
}

export function consumePasswordResetToken(token: string): string | null {
  const row = get(
    "SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used = 0 AND expires_at > ?",
    sha256(token),
    nowMs()
  );
  if (!row) return null;
  run("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", String(row.id));
  return String(row.user_id);
}

export { all, get, run, nowMs };

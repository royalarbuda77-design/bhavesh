import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { config } from "./env";
import { log } from "./logger";
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

export async function setSessionCookie(
  response: Response,
  user: SessionUser,
  opts?: { request?: Request }
): Promise<void> {
  const token = await signSession(user);
  // Secure flag: honour the actual request protocol (proxy-aware) so cookies
  // survive on plain-HTTP hosts too. Default to Secure in production when the
  // protocol can't be determined — HTTPS hosts are unaffected, and HTTP hosts
  // no longer silently drop the session cookie (a classic login-loop cause).
  let secure = config.isProd;
  if (opts?.request) {
    const fwdProto = opts.request.headers.get("x-forwarded-proto");
    if (fwdProto) secure = fwdProto.trim().toLowerCase() === "https";
    else {
      try {
        secure = new URL(opts.request.url).protocol === "https:";
      } catch {
        /* keep default */
      }
    }
  }
  const res = response as Response & { cookies?: { set: (opts: Record<string, unknown>) => void } };
  // SameSite: HTTPS hosts get "None" (required for the session cookie to survive
  // inside embedded/iframe previews, e.g. the Arena live preview — Lax cookies
  // are dropped by browsers in third-party frame contexts, which causes a
  // silent login loop). HTTP hosts keep "Lax" ("None" requires Secure).
  const sameSite: "none" | "lax" = secure ? "none" : "lax";
  // NextResponse/NextServerResponse both expose .cookies.set
  if (res.cookies) {
    res.cookies.set({
      name: config.sessionCookie,
      value: token,
      httpOnly: true,
      sameSite,
      secure,
      path: "/",
      maxAge: config.sessionTtlSeconds,
    });
  } else {
    response.headers.append(
      "Set-Cookie",
      `${config.sessionCookie}=${token}; Path=/; HttpOnly; SameSite=${sameSite === "none" ? "None" : "Lax"}; Max-Age=${config.sessionTtlSeconds}${secure ? "; Secure" : ""}`
    );
  }
  if (!secure && config.isProd) {
    log.warn({}, "Session cookie issued WITHOUT Secure flag (HTTP request). Serve the app over HTTPS in production.");
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

/** Returns the authenticated user (verified against DB) or null.
 *  In AUTH_MODE=single, every request resolves to the auto-provisioned local
 *  owner — no login screen, no cookies needed. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (config.authMode === "single") {
    return getOrCreateLocalUser();
  }
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

const LOCAL_USER_EMAIL = "local@nexus.app";
let localUserCache: SessionUser | null = null;

export function getOrCreateLocalUser(): SessionUser {
  if (localUserCache) return localUserCache;
  const existing = get("SELECT id, email, name, avatar_url FROM users WHERE email = ?", LOCAL_USER_EMAIL);
  if (existing) {
    localUserCache = {
      id: String(existing.id),
      email: String(existing.email),
      name: String(existing.name),
      avatarUrl: existing.avatar_url ? String(existing.avatar_url) : null,
    };
    ensureSettings(localUserCache.id);
    return localUserCache;
  }
  const user = createUser({
    email: LOCAL_USER_EMAIL,
    name: "You",
    // random unusable password — this account is never logged into via credentials
    passwordHash: bcrypt.hashSync(crypto.randomBytes(24).toString("hex"), 10),
  });
  localUserCache = user;
  return user;
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

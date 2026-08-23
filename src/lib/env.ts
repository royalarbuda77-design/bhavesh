import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Central configuration. Reads environment variables with safe development
 * defaults. In production you MUST set AUTH_SECRET (and ideally ENCRYPTION_KEY)
 * via environment — see .env.example.
 */

const isProd = process.env.NODE_ENV === "production";

function dataDir(): string {
  return process.env.DATABASE_PATH
    ? path.dirname(path.resolve(process.env.DATABASE_PATH))
    : path.join(process.cwd(), "data");
}

function databasePath(): string {
  return process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data", "app.db");
}

/**
 * Runtime-generated secrets for development. Stored under data/ (0600) so
 * sessions survive restarts. In production, always set env vars instead.
 */
function loadRuntimeSecrets(): { authSecret: string; encryptionKey: string } {
  const envAuth = process.env.AUTH_SECRET;
  const envEnc = process.env.ENCRYPTION_KEY;
  if (envAuth && envEnc) return { authSecret: envAuth, encryptionKey: envEnc };

  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, ".runtime.json");
  let existing: { authSecret?: string; encryptionKey?: string } = {};
  try {
    existing = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* first run */
  }
  if (envAuth) existing.authSecret = envAuth;
  if (envEnc) existing.encryptionKey = envEnc;
  if (!existing.authSecret) existing.authSecret = crypto.randomBytes(32).toString("hex");
  if (!existing.encryptionKey) existing.encryptionKey = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, JSON.stringify(existing), { mode: 0o600 });
  if (isProd) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "AUTH_SECRET/ENCRYPTION_KEY not set in environment; generated runtime secrets are being used. Set them explicitly for production deployments.",
      })
    );
  }
  return { authSecret: existing.authSecret, encryptionKey: existing.encryptionKey };
}

const runtimeSecrets = loadRuntimeSecrets();

export const config = {
  isProd,
  appName: "Nexus AI",
  databasePath: databasePath(),
  authSecret: runtimeSecrets.authSecret,
  sessionCookie: "nexus_session",
  sessionTtlSeconds: 60 * 60 * 24 * 7,
  appUrl:
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    `http://localhost:3000`,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    get enabled() {
      return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    },
  },
  search: {
    tavilyKey: process.env.TAVILY_API_KEY || "",
    serperKey: process.env.SERPER_API_KEY || "",
    braveKey: process.env.BRAVE_API_KEY || "",
  },
  uploads: {
    maxMb: Number(process.env.MAX_UPLOAD_MB || 10),
    // max characters of extracted text kept per file
    maxTextChars: 200_000,
  },
  rateLimits: {
    auth: Number(process.env.RATE_LIMIT_AUTH || 10),
    chat: Number(process.env.RATE_LIMIT_CHAT || 30),
    search: Number(process.env.RATE_LIMIT_SEARCH || 20),
    files: Number(process.env.RATE_LIMIT_FILES || 20),
    providers: Number(process.env.RATE_LIMIT_PROVIDERS || 15),
  },
};

/** Encryption key bytes for provider credential storage (AES-256-GCM). */
export function encryptionKeyBytes(): Buffer {
  const raw = runtimeSecrets.encryptionKey;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  // derive 32 bytes from arbitrary secret material
  return crypto.scryptSync(raw, "nexus-encryption-salt", 32);
}

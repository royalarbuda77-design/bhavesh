import crypto from "node:crypto";
import { encryptionKeyBytes } from "./env";

/**
 * AES-256-GCM envelope encryption for provider API keys at rest.
 * Format: base64( iv[12] || authTag[16] || ciphertext )
 * The decrypted value NEVER leaves the server.
 */

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKeyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(envelope: string): string {
  const raw = Buffer.from(envelope, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKeyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Human-safe hint like `sk-••••••••1234`. Never returns the full key. */
export function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "••••";
  const prefix = trimmed.slice(0, Math.min(3, trimmed.length - 4));
  const last4 = trimmed.slice(-4);
  return `${prefix}••••••••••••${last4}`;
}

export function last4(apiKey: string): string {
  return apiKey.trim().slice(-4);
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

import { test } from "node:test";
import assert from "node:assert";
import { encryptSecret, decryptSecret, keyHint, last4 } from "../../src/lib/crypto.ts";

test("crypto: AES-256-GCM roundtrip", () => {
  const key = "sk-test-abcdef1234567890";
  const enc = encryptSecret(key);
  assert.notStrictEqual(enc, key);
  assert.ok(!enc.includes(key));
  assert.strictEqual(decryptSecret(enc), key);
});

test("crypto: unique IVs per encryption", () => {
  const key = "same-input";
  assert.notStrictEqual(encryptSecret(key), encryptSecret(key));
});

test("crypto: tampered ciphertext fails to decrypt", () => {
  const enc = encryptSecret("secret-value");
  const raw = Buffer.from(enc, "base64");
  raw[raw.length - 1] ^= 0xff;
  assert.throws(() => decryptSecret(raw.toString("base64")));
});

test("crypto: key hint never leaks the full key", () => {
  const key = "sk-abcdefghijklmnop1234";
  const hint = keyHint(key);
  assert.ok(hint.startsWith("sk-"));
  assert.ok(hint.endsWith("1234"));
  assert.ok(hint.includes("•"));
  assert.ok(!hint.includes("abcdefghijklmnop"));
  assert.strictEqual(last4(key), "1234");
  assert.strictEqual(keyHint("short"), "••••");
});

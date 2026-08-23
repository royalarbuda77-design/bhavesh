import { test } from "node:test";
import assert from "node:assert";
import { validateBaseUrl, normalizeBaseUrl } from "../../src/lib/providers/manager.ts";

test("baseUrl: trims trailing slashes", () => {
  assert.strictEqual(normalizeBaseUrl("https://api.example.com/v1/"), "https://api.example.com/v1");
});

test("baseUrl: rejects non-http protocols and malformed urls", () => {
  assert.strictEqual(validateBaseUrl("custom", "ftp://x.com").ok, false);
  assert.strictEqual(validateBaseUrl("custom", "not a url").ok, false);
  assert.strictEqual(validateBaseUrl("custom", "").ok, false);
});

test("baseUrl: http allowed only for local hosts", () => {
  assert.strictEqual(validateBaseUrl("custom", "http://127.0.0.1:8787/v1").ok, true);
  assert.strictEqual(validateBaseUrl("custom", "http://localhost:3000/v1").ok, true);
  const remote = validateBaseUrl("custom", "http://example.com/v1");
  assert.strictEqual(remote.ok, false);
  assert.ok(remote.ok === false && remote.error.includes("https"));
});

test("baseUrl: https always fine", () => {
  assert.strictEqual(validateBaseUrl("custom", "https://example.com/v1").ok, true);
});

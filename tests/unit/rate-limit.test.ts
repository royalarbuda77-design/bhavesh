import { test } from "node:test";
import assert from "node:assert";
import { checkRateLimit } from "../../src/lib/rate-limit.ts";

test("rate limiter: allows under limit, blocks over, respects window key", () => {
  const key = `unit-${Math.random()}`;
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(checkRateLimit("test", key, 5).ok, true);
  }
  const blocked = checkRateLimit("test", key, 5);
  assert.strictEqual(blocked.ok, false);
  // different identity unaffected
  assert.strictEqual(checkRateLimit("test", `${key}-other`, 5).ok, true);
  // different bucket unaffected
  assert.strictEqual(checkRateLimit("other-bucket", key, 5).ok, true);
});

test("rate limiter: exposes retry-after", () => {
  const key = `unit2-${Math.random()}`;
  for (let i = 0; i < 3; i++) checkRateLimit("t2", key, 3);
  const result = checkRateLimit("t2", key, 3) as { ok: false; retryAfterSeconds: number };
  assert.strictEqual(result.ok, false);
  assert.ok(result.retryAfterSeconds >= 1 && result.retryAfterSeconds <= 60);
});

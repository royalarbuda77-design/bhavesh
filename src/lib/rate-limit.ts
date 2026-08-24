import { NextResponse } from "next/server";

/**
 * In-memory sliding-window rate limiter (server-enforced).
 * Suitable for a single-node deployment; swap for Redis in a cluster.
 */

type Counter = { hits: Map<string, number[]>; lastSweep: number };

const globalStore = globalThis as unknown as { __nexusRateLimit?: Counter };
const store: Counter =
  globalStore.__nexusRateLimit ?? (globalStore.__nexusRateLimit = { hits: new Map(), lastSweep: Date.now() });

function sweep(now: number) {
  if (now - store.lastSweep < 60_000) return;
  store.lastSweep = now;
  for (const [key, times] of store.hits) {
    const alive = times.filter((t) => now - t < 120_000);
    if (alive.length === 0) store.hits.delete(key);
    else store.hits.set(key, alive);
  }
}

export type RateResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(bucket: string, identity: string, limitPerMinute: number): RateResult {
  const now = Date.now();
  sweep(now);
  const key = `${bucket}:${identity}`;
  const windowStart = now - 60_000;
  const times = (store.hits.get(key) ?? []).filter((t) => t > windowStart);
  if (times.length >= limitPerMinute) {
    const retryAfter = Math.ceil((times[0] + 60_000 - now) / 1000);
    return { ok: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }
  times.push(now);
  store.hits.set(key, times);
  return { ok: true };
}

export function rateLimitResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly.", code: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

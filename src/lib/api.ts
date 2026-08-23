import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSessionUser, type SessionUser } from "./auth";
import { log } from "./logger";
import { checkRateLimit, rateLimitResponse, clientIp, type RateResult } from "./rate-limit";
import { config } from "./env";

/**
 * Shared API plumbing: auth guard, rate limiting, request IDs, error mapping.
 * Handlers receive an authenticated context; stack traces never reach clients.
 */

export type ApiContext = {
  user: SessionUser;
  reqId: string;
  req: Request;
  params: Record<string, string>;
};

export type PublicApiContext = {
  reqId: string;
  req: Request;
  ip: string;
  params: Record<string, string>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteCtx = { params: Promise<any> };

async function flattenParams(routeCtx: RouteCtx): Promise<Record<string, string>> {
  const params = await routeCtx?.params;
  return (params ?? {}) as Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function errorResponse(err: unknown, reqId: string): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, code: err.code, reqId }, { status: err.status });
  }
  // Log full detail server-side, show a friendly message client-side.
  log.error({ reqId, err: err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ""}` : String(err) }, "Unhandled API error");
  return NextResponse.json(
    { error: "Something went wrong on our side. Please try again.", code: "internal_error", reqId },
    { status: 500 }
  );
}

function limit(bucket: keyof typeof config.rateLimits) {
  return config.rateLimits[bucket];
}

/** Wrap an authenticated JSON route handler. */
export function withAuth(
  handler: (ctx: ApiContext) => Promise<Response>,
  opts?: { rateLimit?: keyof typeof config.rateLimits }
) {
  return async (req: Request, routeCtx: RouteCtx): Promise<Response> => {
    const reqId = crypto.randomUUID();
    const started = Date.now();
    try {
      const user = await getSessionUser();
      if (!user) {
        return NextResponse.json({ error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
      }
      if (opts?.rateLimit) {
        const result: RateResult = checkRateLimit(opts.rateLimit, user.id, limit(opts.rateLimit));
        if (!result.ok) return rateLimitResponse(result.retryAfterSeconds);
      }
      const params = await flattenParams(routeCtx);
      const res = await handler({ user, reqId, req, params });
      log.info({
        reqId,
        userId: user.id,
        route: new URL(req.url).pathname,
        status: res.status,
        latencyMs: Date.now() - started,
      });
      return res;
    } catch (err) {
      const res = errorResponse(err, reqId);
      log.info({
        reqId,
        route: new URL(req.url).pathname,
        status: res.status,
        latencyMs: Date.now() - started,
      });
      return res;
    }
  };
}

/** Wrap a public (unauthenticated) route handler. Rate limited by IP. */
export function withPublic(
  handler: (ctx: PublicApiContext) => Promise<Response>,
  opts?: { rateLimit?: keyof typeof config.rateLimits }
) {
  return async (req: Request, routeCtx: RouteCtx): Promise<Response> => {
    const reqId = crypto.randomUUID();
    const started = Date.now();
    const ip = clientIp(req);
    try {
      if (opts?.rateLimit) {
        const result: RateResult = checkRateLimit(opts.rateLimit, ip, limit(opts.rateLimit));
        if (!result.ok) return rateLimitResponse(result.retryAfterSeconds);
      }
      const params = await flattenParams(routeCtx);
      const res = await handler({ reqId, req, ip, params });
      log.info({ reqId, route: new URL(req.url).pathname, status: res.status, latencyMs: Date.now() - started });
      return res;
    } catch (err) {
      const res = errorResponse(err, reqId);
      log.info({ reqId, route: new URL(req.url).pathname, status: res.status, latencyMs: Date.now() - started });
      return res;
    }
  };
}

export function jsonOk(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

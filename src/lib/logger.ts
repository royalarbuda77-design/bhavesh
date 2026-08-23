/**
 * Structured server-side logging. Emits single-line JSON for easy parsing.
 *
 * SECURITY: never pass API keys, passwords, tokens or decrypted credentials
 * into these functions. Only identifiers, latencies and error messages.
 */
type Level = "debug" | "info" | "warn" | "error";

export type LogFields = {
  reqId?: string;
  userId?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  route?: string;
  status?: number;
  tool?: string;
  err?: string;
  [key: string]: unknown;
};

const REDACTED_KEYS = new Set([
  "apikey",
  "api_key",
  "key",
  "password",
  "token",
  "secret",
  "authorization",
  "credential",
  "cookies",
]);

function sanitize(fields: LogFields): LogFields {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACTED_KEYS.has(k.toLowerCase())) out[k] = "[redacted]";
    else out[k] = v;
  }
  return out as LogFields;
}

function emit(level: Level, fields: LogFields, msg?: string) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    ...(msg ? { msg } : {}),
    ...sanitize(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (fields: LogFields = {}, msg?: string) => emit("debug", fields, msg),
  info: (fields: LogFields = {}, msg?: string) => emit("info", fields, msg),
  warn: (fields: LogFields = {}, msg?: string) => emit("warn", fields, msg),
  error: (fields: LogFields = {}, msg?: string) => emit("error", fields, msg),
};

import vm from "node:vm";
import { webSearch, fetchUrlReadable, type SearchResult } from "./search";
import { all, get, run, nowMs } from "./db";
import { log } from "./logger";
import type { ToolSpec } from "./providers/types";

/**
 * ToolService — the agent tool registry. Every tool declares a JSON schema,
 * a permission level, a timeout, and returns structured results. Tool calls
 * are persisted for observability.
 */

export type ToolPermission = "standard" | "network" | "sandbox";

export type ToolResult = {
  ok: boolean;
  /** compact JSON-safe result handed to the model */
  output: unknown;
  /** sources to render in the UI (web tools) */
  sources?: SearchResult[];
  summary: string;
};

export type AgentTool = {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  permission: ToolPermission;
  timeoutMs: number;
  available(ctx: ToolContext): boolean;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
};

export type ToolContext = { userId: string; conversationId?: string | null; messageId?: string | null };

/* ─── calculator (safe expression parser — no eval) ─────────────────────── */

const FUNCTIONS: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  log: Math.log10, ln: Math.log, sqrt: Math.sqrt, cbrt: Math.cbrt, exp: Math.exp,
  abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
};

type Token = { kind: "num"; value: number } | { kind: "op" | "func" | "lparen" | "rparen" | "comma"; value: string };

export function evaluateExpression(input: string): number {
  const src = input.replace(/\s+/g, "").replace(/π/g, "pi").replace(/×/g, "*").replace(/÷/g, "/").replace(/\^/g, "^");
  if (!src) throw new Error("Empty expression.");
  if (src.length > 500) throw new Error("Expression too long.");
  if (!/^[0-9eE.+\-*/%^(),a-zA-Z]+$/.test(src)) throw new Error("Expression contains unsupported characters.");

  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      // scientific notation like 1e5 / 2.5e-3
      if (src[j] === "e" || src[j] === "E") {
        let k = j + 1;
        if (src[k] === "+" || src[k] === "-") k++;
        if (/[0-9]/.test(src[k] ?? "")) {
          while (k < src.length && /[0-9]/.test(src[k])) k++;
          j = k;
        }
      }
      const numStr = src.slice(i, j);
      const value = Number(numStr);
      if (!Number.isFinite(value)) throw new Error(`Invalid number: ${numStr}`);
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9]/.test(src[j])) j++;
      const word = src.slice(i, j).toLowerCase();
      if (word === "pi") tokens.push({ kind: "num", value: Math.PI });
      else if (word === "e") tokens.push({ kind: "num", value: Math.E });
      else if (FUNCTIONS[word]) tokens.push({ kind: "func", value: word });
      else throw new Error(`Unknown identifier: ${word}`);
      i = j;
      continue;
    }
    if ("+-*/%^".includes(c)) {
      tokens.push({ kind: "op", value: c });
      i++;
      continue;
    }
    if (c === "(") { tokens.push({ kind: "lparen", value: c }); i++; continue; }
    if (c === ")") { tokens.push({ kind: "rparen", value: c }); i++; continue; }
    if (c === ",") { tokens.push({ kind: "comma", value: c }); i++; continue; }
    throw new Error(`Unexpected character: ${c}`);
  }
  if (tokens.length === 0) throw new Error("Empty expression.");

  // shunting-yard to RPN
  const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 4, "u-": 3, "u+": 3 };
  const RIGHT_ASSOC = new Set(["^", "u-", "u+"]);
  const output: Token[] = [];
  const stack: Token[] = [];
  let prev: Token | null = null;
  for (const tok of tokens) {
    if (tok.kind === "num") output.push(tok);
    else if (tok.kind === "func") stack.push(tok);
    else if (tok.kind === "comma") {
      while (stack.length && stack[stack.length - 1].kind !== "lparen") output.push(stack.pop()!);
      if (!stack.length) throw new Error("Misplaced comma.");
    } else if (tok.kind === "op") {
      // unary minus / plus: operand expected (start, after operator, lparen or comma)
      const operandExpected = prev === null || prev.kind === "op" || prev.kind === "lparen" || prev.kind === "comma";
      const op: Token = operandExpected && (tok.value === "-" || tok.value === "+")
        ? { kind: "op", value: tok.value === "-" ? "u-" : "u+" }
        : tok;
      const isUnary = op.value === "u-" || op.value === "u+";
      // unary (prefix) operators never pop — their operand is read afterwards
      if (!isUnary) {
        while (
          stack.length &&
          stack[stack.length - 1].kind === "op" &&
          (PREC[stack[stack.length - 1].value] > PREC[op.value] ||
            (PREC[stack[stack.length - 1].value] === PREC[op.value] && !RIGHT_ASSOC.has(op.value)))
        ) {
          output.push(stack.pop()!);
        }
      }
      stack.push(op);
    } else if (tok.kind === "lparen") stack.push(tok);
    else if (tok.kind === "rparen") {
      while (stack.length && stack[stack.length - 1].kind !== "lparen") output.push(stack.pop()!);
      if (!stack.length) throw new Error("Mismatched parentheses.");
      stack.pop();
      if (stack.length && stack[stack.length - 1].kind === "func") output.push(stack.pop()!);
    }
    prev = tok;
  }
  while (stack.length) {
    const top = stack.pop()!;
    if (top.kind === "lparen") throw new Error("Mismatched parentheses.");
    output.push(top);
  }

  // evaluate RPN
  const values: number[] = [];
  for (const tok of output) {
    if (tok.kind === "num") values.push(tok.value);
    else if (tok.kind === "func") {
      const x = values.pop();
      if (x === undefined) throw new Error(`Missing argument for ${tok.value}.`);
      values.push(FUNCTIONS[tok.value](x));
    } else if (tok.kind === "op") {
      if (tok.value === "u-" || tok.value === "u+") {
        const a = values.pop();
        if (a === undefined) throw new Error("Malformed expression.");
        values.push(tok.value === "u-" ? -a : a);
        continue;
      }
      const b = values.pop();
      const a = values.pop();
      if (a === undefined || b === undefined) throw new Error("Malformed expression.");
      switch (tok.value) {
        case "+": values.push(a + b); break;
        case "-": values.push(a - b); break;
        case "*": values.push(a * b); break;
        case "/":
          if (b === 0) throw new Error("Division by zero.");
          values.push(a / b);
          break;
        case "%": values.push(a % b); break;
        case "^": values.push(Math.pow(a, b)); break;
        default: throw new Error(`Unknown operator ${tok.value}.`);
      }
    }
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error("Could not evaluate expression.");
  return values[0];
}

/* ─── tool implementations ──────────────────────────────────────────────── */

const calculatorTool: AgentTool = {
  name: "calculator",
  description: "Evaluate a mathematical expression precisely. Supports + - * / % ^ parentheses, functions (sin, cos, tan, log, ln, sqrt, cbrt, exp, abs, floor, ceil, round) and constants pi, e. Example: sqrt(2)^10 + ln(20).",
  schema: {
    type: "object",
    properties: { expression: { type: "string", description: "The arithmetic expression to evaluate" } },
    required: ["expression"],
  },
  permission: "standard",
  timeoutMs: 2_000,
  available: () => true,
  async execute(args) {
    const expression = String(args.expression ?? "");
    try {
      const value = evaluateExpression(expression);
      return { ok: true, output: { expression, value }, summary: `${expression} = ${value}` };
    } catch (err) {
      return { ok: false, output: { expression, error: err instanceof Error ? err.message : "Invalid expression" }, summary: `Calculator failed: ${expression}` };
    }
  },
};

const webSearchTool: AgentTool = {
  name: "web_search",
  description: "Search the web for current information. Returns a list of results with title, URL and snippet. Use for recent events, facts you are unsure about, or anything requiring up-to-date sources.",
  schema: {
    type: "object",
    properties: { query: { type: "string", description: "The search query" } },
    required: ["query"],
  },
  permission: "network",
  timeoutMs: 20_000,
  available: () => true,
  async execute(args) {
    const query = String(args.query ?? "");
    const outcome = await webSearch(query, 5);
    if (!outcome.ok) return { ok: false, output: { error: outcome.error }, summary: `Web search failed for "${query}"` };
    return {
      ok: true,
      output: { results: outcome.results },
      sources: outcome.results,
      summary: `Searched the web for "${query}" (${outcome.provider})`,
    };
  },
};

const fetchUrlTool: AgentTool = {
  name: "fetch_url",
  description: "Fetch an http(s) URL and return its readable text content. Use after web_search when a snippet is not enough, or when the user references a specific URL.",
  schema: {
    type: "object",
    properties: { url: { type: "string", description: "The http(s) URL to fetch" } },
    required: ["url"],
  },
  permission: "network",
  timeoutMs: 20_000,
  available: () => true,
  async execute(args) {
    const url = String(args.url ?? "");
    const outcome = await fetchUrlReadable(url);
    if (!outcome.ok) return { ok: false, output: { url, error: outcome.error }, summary: `Fetch failed: ${url}` };
    return {
      ok: true,
      output: { url, title: outcome.title, text: outcome.text.slice(0, 12_000) },
      sources: [{ title: outcome.title, url, snippet: outcome.text.slice(0, 300) }],
      summary: `Fetched ${url}`,
    };
  },
};

const fileSearchTool: AgentTool = {
  name: "file_search",
  description: "Keyword search across the user's uploaded documents (PDF, DOCX, TXT, MD, CSV). Returns matching excerpts.",
  schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keywords to look for" },
    },
    required: ["query"],
  },
  permission: "standard",
  timeoutMs: 5_000,
  available: (ctx) => fileSearchAvailable(ctx.userId),
  async execute(args, ctx) {
    const query = String(args.query ?? "").trim();
    if (!query) return { ok: false, output: { error: "Empty query." }, summary: "File search: empty query" };
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 5);
    if (words.length === 0) return { ok: false, output: { error: "No usable keywords." }, summary: "File search: no keywords" };
    const files = all(
      "SELECT id, filename, text_content FROM files WHERE user_id = ? AND text_content IS NOT NULL AND (conversation_id IS NULL OR conversation_id = ?)",
      ctx.userId,
      ctx.conversationId ?? ""
    );
    const hits: { file: string; excerpt: string }[] = [];
    for (const f of files) {
      const text = String(f.text_content);
      const lower = text.toLowerCase();
      for (const w of words) {
        const idx = lower.indexOf(w);
        if (idx !== -1) {
          hits.push({ file: String(f.filename), excerpt: text.slice(Math.max(0, idx - 120), idx + 280) });
          break;
        }
      }
      if (hits.length >= 5) break;
    }
    return { ok: true, output: { hits }, summary: hits.length ? `Found ${hits.length} file matches for "${query}"` : `No file matches for "${query}"` };
  },
};

function fileSearchAvailable(userId: string): boolean {
  const row = getSafe("SELECT COUNT(*) AS n FROM files WHERE user_id = ? AND text_content IS NOT NULL", userId);
  return Number(row?.n ?? 0) > 0;
}

function getSafe(sql: string, ...params: (string | number | null)[]): Record<string, unknown> | undefined {
  return get(sql, ...params);
}

const codeExecutionTool: AgentTool = {
  name: "run_javascript",
  description: "Execute a short JavaScript snippet in an isolated sandbox (no network, no filesystem) with a 2s CPU timeout and return console output. Useful for quick computations, data transformation or verifying logic.",
  schema: {
    type: "object",
    properties: { code: { type: "string", description: "JavaScript source. Use console.log() to produce output. The result of the last expression is also returned." } },
    required: ["code"],
  },
  permission: "sandbox",
  timeoutMs: 5_000,
  available: () => true,
  async execute(args) {
    const code = String(args.code ?? "").slice(0, 20_000);
    const logs: string[] = [];
    const sandbox = {
      console: {
        log: (...a: unknown[]) => logs.push(a.map(fmt).join(" ")),
        error: (...a: unknown[]) => logs.push("ERROR: " + a.map(fmt).join(" ")),
        warn: (...a: unknown[]) => logs.push("WARN: " + a.map(fmt).join(" ")),
      },
      Math, JSON, Number, String, Boolean, Array, Object, Date, RegExp, Map, Set, parseInt, parseFloat, isNaN, isFinite,
    };
    try {
      const context = vm.createContext(sandbox);
      // eval-style completion semantics: the value of the last expression
      // statement is returned (use console.log for intermediate output)
      const script = new vm.Script(code);
      const result = script.runInContext(context, { timeout: 2_000 });
      return {
        ok: true,
        output: { logs, result: result === undefined ? null : safeResult(result) },
        summary: logs.length ? `Code executed. Output: ${logs.slice(0, 3).join(" | ")}` : "Code executed.",
      };
    } catch (err) {
      return { ok: false, output: { logs, error: err instanceof Error ? err.message : String(err) }, summary: "Code execution failed" };
    }
  },
};

function fmt(v: unknown): string {
  if (typeof v === "string") return v;
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
}

function safeResult(v: unknown): unknown {
  try {
    JSON.stringify(v);
    return v;
  } catch {
    return String(v);
  }
}

export const TOOLS: AgentTool[] = [calculatorTool, webSearchTool, fetchUrlTool, fileSearchTool, codeExecutionTool];

export function getTool(name: string): AgentTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Tools enabled for a given chat turn (respecting availability + user settings). */
export function toolsForTurn(ctx: ToolContext, opts: { webSearch: boolean; codeExecution: boolean }): { tool: AgentTool; spec: ToolSpec }[] {
  return TOOLS.filter((t) => {
    if (t.name === "web_search" || t.name === "fetch_url") return opts.webSearch || t.name === "fetch_url" ? t.available(ctx) : false;
    if (t.name === "run_javascript") return opts.codeExecution && t.available(ctx);
    return t.available(ctx);
  }).map((t) => ({ tool: t, spec: { name: t.name, description: t.description, parameters: t.schema } }));
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const tool = getTool(name);
  const started = Date.now();
  let result: ToolResult;
  if (!tool) {
    result = { ok: false, output: { error: `Unknown tool: ${name}` }, summary: `Unknown tool ${name}` };
  } else {
    try {
      result = await Promise.race([
        tool.execute(args, ctx),
        new Promise<ToolResult>((_, reject) => setTimeout(() => reject(new Error(`Tool timed out after ${tool.timeoutMs}ms`)), tool.timeoutMs)),
      ]);
    } catch (err) {
      result = { ok: false, output: { error: err instanceof Error ? err.message : "Tool failed" }, summary: `${name} failed` };
    }
  }
  run(
    "INSERT INTO tool_calls (id, user_id, conversation_id, message_id, tool, args_json, result_json, status, latency_ms, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    crypto.randomUUID(),
    ctx.userId,
    ctx.conversationId ?? null,
    ctx.messageId ?? null,
    name,
    JSON.stringify(args).slice(0, 4_000),
    JSON.stringify(result.output).slice(0, 8_000),
    result.ok ? "ok" : "error",
    Date.now() - started,
    nowMs()
  );
  log.info({ userId: ctx.userId, tool: name, latencyMs: Date.now() - started }, result.ok ? "tool ok" : "tool error");
  return result;
}

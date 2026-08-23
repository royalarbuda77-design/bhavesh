import type {
  DiscoveredModel,
  ProviderAdapter,
  ProviderFailure,
  ResolvedCredential,
  StreamEvent,
  StreamRequest,
  TestResult,
  ToolSpec,
  WireMessage,
} from "./types";
import { mapProviderError, networkFailure } from "./types";
import { parseSSE } from "../sse";

/** Anthropic Messages API adapter (Claude). */

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

function toAnthropicMessages(messages: WireMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") continue; // handled separately
    if (m.role === "tool") {
      out.push({ role: "user", content: [{ type: "tool_result", tool_use_id: m.toolCallId ?? "", content: m.content }] });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const blocks: ContentBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const c of m.toolCalls) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.args });
      out.push({ role: "assistant", content: blocks });
      continue;
    }
    if (m.images?.length) {
      const blocks: ContentBlock[] = [{ type: "text", text: m.content }];
      for (const img of m.images) blocks.push({ type: "image", source: { type: "base64", media_type: img.mime, data: img.dataB64 } });
      out.push({ role: m.role as "user" | "assistant", content: blocks });
      continue;
    }
    out.push({ role: m.role as "user" | "assistant", content: m.content });
  }
  return out;
}

function toAnthropicTools(tools: ToolSpec[]): unknown[] {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

function headers(creds: ResolvedCredential): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": creds.apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (creds.orgId) h["anthropic-organization"] = creds.orgId;
  return h;
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function throwMapped(res: Response, body: string): never {
  const failure: ProviderFailure = mapProviderError("Anthropic", res.status, body);
  const err = new Error(failure.message) as Error & ProviderFailure;
  Object.assign(err, failure);
  throw err;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly protocol = "anthropic-messages" as const;

  async testConnection(creds: ResolvedCredential): Promise<TestResult> {
    try {
      const res = await fetch(joinUrl(creds.baseUrl, "/v1/models"), {
        method: "GET",
        headers: headers(creds),
        signal: AbortSignal.timeout(12_000),
      });
      const body = await readBody(res);
      if (res.ok) {
        return { ok: true, message: "Connection successful.", detail: "Claude models available via discovery.", discoverySupported: true };
      }
      const f = mapProviderError("Anthropic", res.status, body);
      return { ok: false, message: f.message, detail: res.status === 401 ? "Authentication failed — check your API key." : body.slice(0, 200), discoverySupported: false };
    } catch (err) {
      const f = networkFailure("Anthropic", err);
      return { ok: false, message: f.message, discoverySupported: false };
    }
  }

  async listModels(creds: ResolvedCredential): Promise<DiscoveredModel[]> {
    const res = await fetch(joinUrl(creds.baseUrl, "/v1/models"), {
      method: "GET",
      headers: headers(creds),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await readBody(res);
    if (!res.ok) throwMapped(res, body);
    const parsed = JSON.parse(body) as { data?: { id?: string; display_name?: string }[] };
    return (parsed.data ?? [])
      .filter((m) => typeof m.id === "string")
      .map((m) => ({ modelId: m.id as string, displayName: m.display_name || (m.id as string) }));
  }

  async *streamChat(creds: ResolvedCredential, req: StreamRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
    const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens ?? 8192,
      messages: toAnthropicMessages(req.messages),
      stream: true,
    };
    if (system) body.system = system;
    if (req.temperature != null) body.temperature = req.temperature;
    if (req.tools?.length) {
      body.tools = toAnthropicTools(req.tools);
      body.tool_choice = { type: "auto" };
    }
    const res = await fetch(joinUrl(creds.baseUrl, "/v1/messages"), {
      method: "POST",
      headers: headers(creds),
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!res.ok || !res.body) throwMapped(res, await readBody(res));

    const openTools = new Map<number, { id: string; name: string; args: string }>();
    for await (const evt of parseSSE(res.body)) {
      if (!evt.data) continue;
      let parsed: {
        type?: string;
        message?: { usage?: { input_tokens?: number; output_tokens?: number } };
        index?: number;
        content_block?: { type?: string; id?: string; name?: string; text?: string };
        delta?: { type?: string; text?: string; thinking?: string; partial_json?: string; stop_reason?: string };
        usage?: { input_tokens?: number; output_tokens?: number };
        error?: { type?: string; message?: string };
      };
      try {
        parsed = JSON.parse(evt.data);
      } catch {
        continue;
      }
      if (parsed.type === "error" && parsed.error) {
        yield { type: "error", code: "provider_error", message: parsed.error.message ?? "Anthropic stream error", retryable: false };
        continue;
      }
      if (parsed.type === "message_start" && parsed.message?.usage) {
        yield { type: "usage", inputTokens: parsed.message.usage.input_tokens };
      }
      if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") {
        openTools.set(parsed.index ?? 0, { id: parsed.content_block.id ?? "", name: parsed.content_block.name ?? "", args: "" });
      }
      if (parsed.type === "content_block_delta") {
        const d = parsed.delta ?? {};
        if (d.type === "text_delta" && d.text) yield { type: "text", delta: d.text };
        else if (d.type === "thinking_delta" && d.thinking) yield { type: "reasoning", delta: d.thinking };
        else if (d.type === "input_json_delta" && d.partial_json) {
          const acc = openTools.get(parsed.index ?? 0);
          if (acc) acc.args += d.partial_json;
        }
      }
      if (parsed.type === "content_block_stop" && openTools.has(parsed.index ?? 0)) {
        const acc = openTools.get(parsed.index ?? 0)!;
        openTools.delete(parsed.index ?? 0);
        yield { type: "tool_calls", calls: [{ id: acc.id, name: acc.name, args: safeParse(acc.args) }] };
      }
      if (parsed.type === "message_delta" && parsed.usage) {
        yield { type: "usage", outputTokens: parsed.usage.output_tokens };
      }
    }
    for (const [idx, acc] of openTools) {
      yield { type: "tool_calls", calls: [{ id: acc.id || `call_${idx}`, name: acc.name, args: safeParse(acc.args) }] };
    }
    yield { type: "done" };
  }

  async generateText(
    creds: ResolvedCredential,
    req: StreamRequest,
    timeoutMs = 90_000
  ): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
    const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens ?? 8192,
      messages: toAnthropicMessages(req.messages),
    };
    if (system) body.system = system;
    if (req.temperature != null) body.temperature = req.temperature;
    if (req.tools?.length) {
      body.tools = toAnthropicTools(req.tools);
      body.tool_choice = { type: "auto" };
    }
    const res = await fetch(joinUrl(creds.baseUrl, "/v1/messages"), {
      method: "POST",
      headers: headers(creds),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await readBody(res);
    if (!res.ok) throwMapped(res, text);
    const parsed = JSON.parse(text) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text: (parsed.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
      usage: parsed.usage ? { inputTokens: parsed.usage.input_tokens, outputTokens: parsed.usage.output_tokens } : undefined,
    };
  }
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : { value: v };
  } catch {
    return { _raw: raw };
  }
}

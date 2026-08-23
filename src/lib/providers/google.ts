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

/** Google Gemini (generativelanguage.googleapis.com) adapter. */

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } }
  | { thought?: boolean; text?: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function toGeminiContents(messages: WireMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  const push = (role: "user" | "model", parts: GeminiPart[]) => {
    if (out.length > 0 && out[out.length - 1].role === role) out[out.length - 1].parts.push(...parts);
    else out.push({ role, parts });
  };
  for (const m of messages) {
    if (m.role === "system") continue; // handled separately
        if (m.role === "tool") {
          push("user", [{ functionResponse: { name: m.toolName || m.toolCallId?.split(":", 1)[0] || "tool", response: { result: m.content } } }]);
          continue;
        }
    if (m.role === "assistant" && m.toolCalls?.length) {
      push("model", m.toolCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } })));
      if (m.content) push("model", [{ text: m.content }]);
      continue;
    }
    const parts: GeminiPart[] = [{ text: m.content }];
    for (const img of m.images ?? []) parts.push({ inline_data: { mime_type: img.mime, data: img.dataB64 } });
    push(m.role === "assistant" ? "model" : "user", parts);
  }
  return out;
}

/** Gemini REST expects uppercase OpenAPI type enums. */
function upperCaseTypes(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "type" && typeof v === "string") out[k] = v.toUpperCase();
    else if (k === "properties" && v && typeof v === "object")
      out[k] = Object.fromEntries(
        Object.entries(v as Record<string, Record<string, unknown>>).map(([pk, pv]) => [pk, upperCaseTypes(pv)])
      );
    else if (k === "items" && v && typeof v === "object") out[k] = upperCaseTypes(v as Record<string, unknown>);
    else if (k === "$schema" || k === "additionalProperties") continue;
    else out[k] = v;
  }
  return out;
}

function toGeminiTools(tools: ToolSpec[]): unknown[] {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: upperCaseTypes(t.parameters),
      })),
    },
  ];
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function throwMapped(res: Response, body: string): never {
  const failure: ProviderFailure = mapProviderError("Google Gemini", res.status, body);
  const err = new Error(failure.message) as Error & ProviderFailure;
  Object.assign(err, failure);
  throw err;
}

export class GoogleAdapter implements ProviderAdapter {
  readonly protocol = "google-generative" as const;

  private base(creds: ResolvedCredential): string {
    return creds.baseUrl.replace(/\/+$/, "");
  }

  private headers(creds: ResolvedCredential): Record<string, string> {
    return { "Content-Type": "application/json", "x-goog-api-key": creds.apiKey };
  }

  async testConnection(creds: ResolvedCredential): Promise<TestResult> {
    try {
      const res = await fetch(`${this.base(creds)}/models?pageSize=1`, {
        method: "GET",
        headers: this.headers(creds),
        signal: AbortSignal.timeout(12_000),
      });
      const body = await readBody(res);
      if (res.ok) return { ok: true, message: "Connection successful.", detail: "Gemini models available via discovery.", discoverySupported: true };
      const f = mapProviderError("Google Gemini", res.status, body);
      return { ok: false, message: f.message, detail: res.status === 401 || res.status === 403 ? "Authentication failed — check your API key." : body.slice(0, 200), discoverySupported: false };
    } catch (err) {
      const f = networkFailure("Google Gemini", err);
      return { ok: false, message: f.message, discoverySupported: false };
    }
  }

  async listModels(creds: ResolvedCredential): Promise<DiscoveredModel[]> {
    const res = await fetch(`${this.base(creds)}/models?pageSize=1000`, {
      method: "GET",
      headers: this.headers(creds),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await readBody(res);
    if (!res.ok) throwMapped(res, body);
    const parsed = JSON.parse(body) as {
      models?: { name?: string; displayName?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[] }[];
    };
    return (parsed.models ?? [])
      .filter((m) => typeof m.name === "string")
      .map((m) => ({
        modelId: (m.name as string).replace(/^models\//, ""),
        displayName: m.displayName || (m.name as string).replace(/^models\//, ""),
        contextWindow: typeof m.inputTokenLimit === "number" ? m.inputTokenLimit : null,
        hints: { methods: m.supportedGenerationMethods },
      }));
  }

  async *streamChat(creds: ResolvedCredential, req: StreamRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
    const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const body: Record<string, unknown> = {
      contents: toGeminiContents(req.messages),
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (req.temperature != null) body.generationConfig = { temperature: req.temperature, maxOutputTokens: req.maxTokens ?? 8192 };
    if (req.tools?.length) body.tools = toGeminiTools(req.tools);

    const url = `${this.base(creds)}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(creds),
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!res.ok || !res.body) throwMapped(res, await readBody(res));

    for await (const evt of parseSSE(res.body)) {
      if (!evt.data) continue;
      let parsed: {
        candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        error?: { message?: string };
      };
      try {
        parsed = JSON.parse(evt.data);
      } catch {
        continue;
      }
      if (parsed.error?.message) {
        yield { type: "error", code: "provider_error", message: parsed.error.message, retryable: false };
        continue;
      }
      const parts = parsed.candidates?.[0]?.content?.parts ?? [];
      const calls: { id: string; name: string; args: Record<string, unknown> }[] = [];
      for (const part of parts) {
        if ("functionCall" in part && part.functionCall) {
          calls.push({ id: `gemini_${part.functionCall.name}`, name: part.functionCall.name, args: part.functionCall.args ?? {} });
        } else if ("text" in part && part.text) {
          if ((part as { thought?: boolean }).thought) yield { type: "reasoning", delta: part.text };
          else yield { type: "text", delta: part.text };
        }
      }
      if (calls.length) yield { type: "tool_calls", calls };
      if (parsed.usageMetadata)
        yield { type: "usage", inputTokens: parsed.usageMetadata.promptTokenCount, outputTokens: parsed.usageMetadata.candidatesTokenCount };
    }
    yield { type: "done" };
  }

  async generateText(
    creds: ResolvedCredential,
    req: StreamRequest,
    timeoutMs = 90_000
  ): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
    const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const body: Record<string, unknown> = { contents: toGeminiContents(req.messages) };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (req.temperature != null) body.generationConfig = { temperature: req.temperature, maxOutputTokens: req.maxTokens ?? 8192 };
    if (req.tools?.length) body.tools = toGeminiTools(req.tools);
    const url = `${this.base(creds)}/models/${encodeURIComponent(req.model)}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(creds),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await readBody(res);
    if (!res.ok) throwMapped(res, text);
    const parsed = JSON.parse(text) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    return {
      text: (parsed.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join(""),
      usage: parsed.usageMetadata
        ? { inputTokens: parsed.usageMetadata.promptTokenCount, outputTokens: parsed.usageMetadata.candidatesTokenCount }
        : undefined,
    };
  }
}

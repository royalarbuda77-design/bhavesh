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
import { PROVIDERS } from "./registry";
import { parseSSE } from "../sse";
import { config } from "../env";

/**
 * OpenAI chat-completions protocol adapter. Serves: OpenAI, OpenRouter, Groq,
 * Mistral, xAI and any custom OpenAI-compatible endpoint. It does NOT claim
 * compatibility — it verifies against the live endpoint during connection
 * tests and reports precise errors otherwise.
 */

type OpenAIMessage =
  | { role: "system" | "user" | "assistant"; content: string | ContentPart[]; tool_calls?: unknown }
  | { role: "tool"; tool_call_id: string; content: string };

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

function toOpenAIMessages(messages: WireMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.toolCallId ?? "", content: m.content });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      out.push({
        role: "assistant",
        content: m.content || "",
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      });
      continue;
    }
    if (m.images?.length) {
      const parts: ContentPart[] = [{ type: "text", text: m.content }];
      for (const img of m.images) parts.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.dataB64}` } });
      out.push({ role: m.role, content: parts });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function toOpenAITools(tools: ToolSpec[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

function headers(creds: ResolvedCredential): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${creds.apiKey}`,
  };
  if (creds.orgId) h["OpenAI-Organization"] = creds.orgId;
  if (creds.projectId) h["OpenAI-Project"] = creds.projectId;
  if (creds.providerId === "openrouter") {
    h["HTTP-Referer"] = config.appUrl;
    h["X-Title"] = config.appName;
  }
  return h;
}

async function safeFetch(url: string, init: RequestInit & { timeoutMs?: number }, signal?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(init.timeoutMs ?? 15_000);
  const composite = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return fetch(url, { ...init, signal: composite });
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function throwMapped(providerName: string, res: Response, body: string): never {
  const failure: ProviderFailure = mapProviderError(providerName, res.status, body);
  const err = new Error(failure.message) as Error & ProviderFailure;
  Object.assign(err, failure);
  throw err;
}

/* ─── model discovery normalisation ─────────────────────────────────────── */

type RawModel = {
  id?: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[] };
  supported_parameters?: string[];
  owned_by?: string;
  pricing?: { prompt?: string; completion?: string };
};

function normalizeModels(raw: unknown): DiscoveredModel[] {
  const data = (raw as { data?: RawModel[] })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((m) => typeof m?.id === "string" && m.id)
    .map((m) => ({
      modelId: m.id as string,
      displayName: m.name || (m.id as string),
      contextWindow: typeof m.context_length === "number" ? m.context_length : null,
      pricing: m.pricing
        ? {
            promptPer1M: m.pricing.prompt ? Math.round(Number(m.pricing.prompt) * 1_000_000 * 100) / 100 : undefined,
            completionPer1M: m.pricing.completion ? Math.round(Number(m.pricing.completion) * 1_000_000 * 100) / 100 : undefined,
          }
        : null,
      hints: {
        inputModalities: m.architecture?.input_modalities,
        supportedParameters: m.supported_parameters,
        ownedBy: m.owned_by,
      },
    }));
}

/* ─── adapter ───────────────────────────────────────────────────────────── */

export class OpenAICompatAdapter implements ProviderAdapter {
  readonly protocol = "openai-completions" as const;

  private providerName(creds: ResolvedCredential): string {
    return creds.providerId === "custom" ? creds.label : PROVIDERS[creds.providerId].name;
  }

  async testConnection(creds: ResolvedCredential, opts?: { modelId?: string }): Promise<TestResult> {
    const name = this.providerName(creds);
    try {
      const res = await safeFetch(`${creds.baseUrl}/models`, { method: "GET", headers: headers(creds), timeoutMs: 12_000 });
      const body = await readBody(res);
      if (res.status === 401 || res.status === 403) {
        const f = mapProviderError(name, res.status, body);
        return { ok: false, message: f.message, detail: "Authentication failed — check your API key.", discoverySupported: false };
      }
      if (res.ok) {
        let count = 0;
        try {
          count = normalizeModels(JSON.parse(body)).length;
        } catch { count = 0; }
        if (opts?.modelId) {
          const probe = await this.probeModel(creds, opts.modelId);
          if (!probe.ok) return probe;
        }
        return {
          ok: true,
          message: "Connection successful.",
          detail: count ? `${count} models available via discovery.` : "Key accepted. Model discovery returned no models — you can still enter a model ID manually.",
          discoverySupported: count > 0,
        };
      }
      if (res.status === 404 && opts?.modelId) {
        // endpoint has no /models route — verify protocol with a real completion
        const probe = await this.probeModel(creds, opts.modelId);
        if (probe.ok) return { ...probe, detail: "Endpoint does not expose /models, but chat completions work. Discovery unavailable.", discoverySupported: false };
        return probe;
      }
      const f = mapProviderError(name, res.status, body);
      return { ok: false, message: f.message, detail: body.slice(0, 200), discoverySupported: false };
    } catch (err) {
      const f = networkFailure(name, err);
      return { ok: false, message: f.message, discoverySupported: false };
    }
  }

  /** Minimal 1-token completion verifying OpenAI chat-completions compatibility. */
  private async probeModel(creds: ResolvedCredential, modelId: string): Promise<TestResult> {
    const name = this.providerName(creds);
    try {
      const res = await safeFetch(`${creds.baseUrl}/chat/completions`, {
        method: "POST",
        headers: headers(creds),
        body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false }),
        timeoutMs: 20_000,
      });
      const body = await readBody(res);
      if (!res.ok) {
        const f = mapProviderError(name, res.status, body);
        if (res.status === 404) return { ok: false, message: "Model is not available on this endpoint.", detail: f.message, discoverySupported: false };
        return { ok: false, message: f.message, discoverySupported: false };
      }
      let shaped = false;
      try {
        const parsed = JSON.parse(body) as { choices?: unknown[] };
        shaped = Array.isArray(parsed.choices);
      } catch { shaped = false; }
      if (!shaped)
        return { ok: false, message: "This provider is not compatible with the selected adapter (unexpected response format).", discoverySupported: false };
      return { ok: true, message: "Connection successful. Chat completions verified.", discoverySupported: false };
    } catch (err) {
      const f = networkFailure(name, err);
      return { ok: false, message: f.message, discoverySupported: false };
    }
  }

  async listModels(creds: ResolvedCredential): Promise<DiscoveredModel[]> {
    const name = this.providerName(creds);
    const res = await safeFetch(`${creds.baseUrl}/models`, { method: "GET", headers: headers(creds), timeoutMs: 20_000 });
    const body = await readBody(res);
    if (!res.ok) throwMapped(name, res, body);
    return normalizeModels(JSON.parse(body));
  }

  async *streamChat(creds: ResolvedCredential, req: StreamRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
    const name = this.providerName(creds);
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAIMessages(req.messages),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (req.maxTokens) body.max_tokens = req.maxTokens;
    if (req.temperature != null) body.temperature = req.temperature;
    if (req.tools?.length) {
      body.tools = toOpenAITools(req.tools);
      body.tool_choice = "auto";
    }
    const res = await safeFetch(
      `${creds.baseUrl}/chat/completions`,
      { method: "POST", headers: headers(creds), body: JSON.stringify(body), timeoutMs: 30_000 },
      signal
    );
    if (!res.ok || !res.body) throwMapped(name, res, await readBody(res));

    const toolAcc = new Map<number, { id: string; name: string; args: string }>();
    for await (const evt of parseSSE(res.body)) {
      if (evt.data === "[DONE]") break;
      let parsed: {
        choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
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
      const choice = parsed.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) yield { type: "text", delta: delta.content };
      const think = delta?.reasoning_content ?? delta?.reasoning;
      if (think) yield { type: "reasoning", delta: think };
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const acc = toolAcc.get(idx) ?? { id: "", name: "", args: "" };
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (tc.function?.arguments) acc.args += tc.function.arguments;
          toolAcc.set(idx, acc);
        }
      }
      if (parsed.usage) {
        yield {
          type: "usage",
          inputTokens: parsed.usage.prompt_tokens,
          outputTokens: parsed.usage.completion_tokens,
        };
      }
      if (choice?.finish_reason === "tool_calls" || choice?.finish_reason === "stop") {
        if (toolAcc.size > 0 && choice?.finish_reason === "tool_calls") {
          const calls = [...toolAcc.entries()].sort((a, b) => a[0] - b[0]).map(([i, acc]) => ({
            id: acc.id || `call_${i}`,
            name: acc.name,
            args: safeParseArgs(acc.args),
          }));
          toolAcc.clear();
          yield { type: "tool_calls", calls };
        }
      }
    }
    if (toolAcc.size > 0) {
      const calls = [...toolAcc.entries()].sort((a, b) => a[0] - b[0]).map(([i, acc]) => ({
        id: acc.id || `call_${i}`,
        name: acc.name,
        args: safeParseArgs(acc.args),
      }));
      yield { type: "tool_calls", calls };
    }
    yield { type: "done" };
  }

  async generateText(
    creds: ResolvedCredential,
    req: StreamRequest,
    timeoutMs = 90_000
  ): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
    const name = this.providerName(creds);
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAIMessages(req.messages),
      stream: false,
    };
    if (req.maxTokens) body.max_tokens = req.maxTokens;
    if (req.temperature != null) body.temperature = req.temperature;
    if (req.tools?.length) {
      body.tools = toOpenAITools(req.tools);
      body.tool_choice = "auto";
    }
    const res = await safeFetch(`${creds.baseUrl}/chat/completions`, {
      method: "POST",
      headers: headers(creds),
      body: JSON.stringify(body),
      timeoutMs,
    });
    const text = await readBody(res);
    if (!res.ok) throwMapped(name, res, text);
    const parsed = JSON.parse(text) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: parsed.choices?.[0]?.message?.content ?? "",
      usage: parsed.usage ? { inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens } : undefined,
    };
  }
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : { value: v };
  } catch {
    return { _raw: raw };
  }
}

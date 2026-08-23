/**
 * Provider abstraction layer.
 *
 * A ProviderAdapter knows how to speak one wire protocol (OpenAI-compatible
 * chat completions, Anthropic messages, Google Gemini generateContent).
 * Adding a provider = adding a registry entry (for OpenAI-compatible ones)
 * or implementing one new adapter. Nothing else in the app changes.
 */

export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "groq"
  | "mistral"
  | "xai"
  | "custom";

/** tri-state capability: null = unknown (never assume support) */
export type TriState = true | false | null;

export type Capabilities = {
  text: boolean;
  streaming: boolean;
  vision: TriState;
  toolCalling: TriState;
  reasoning: TriState;
  structuredOutput: TriState;
  imageGeneration: boolean;
};

export type ModelLabels = { fast?: boolean; coding?: boolean };

export type ImageAttachment = { mime: string; dataB64: string };

export type AgentToolCall = { id: string; name: string; args: Record<string, unknown> };

export type WireMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: ImageAttachment[];
  /** assistant message that requested tool calls */
  toolCalls?: AgentToolCall[];
  /** tool result message */
  toolCallId?: string;
  toolName?: string;
};

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON-schema-ish
};

export type StreamRequest = {
  model: string;
  messages: WireMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
};

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_calls"; calls: AgentToolCall[] }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "error"; code: string; message: string; retryable: boolean; status?: number }
  | { type: "done" };

export type TestResult = {
  ok: boolean;
  message: string;
  detail?: string;
  discoverySupported: boolean;
};

export type DiscoveredModel = {
  modelId: string;
  displayName: string;
  contextWindow?: number | null;
  pricing?: { promptPer1M?: number; completionPer1M?: number } | null;
  /** raw provider hints feeding capability detection */
  hints?: {
    inputModalities?: string[];
    supportedParameters?: string[];
    methods?: string[];
    ownedBy?: string;
  };
};

export type ResolvedCredential = {
  credentialId: string;
  userId: string;
  providerId: ProviderId;
  label: string;
  baseUrl: string;
  apiKey: string;
  orgId?: string | null;
  projectId?: string | null;
};

export interface ProviderAdapter {
  readonly protocol: "openai-completions" | "anthropic-messages" | "google-generative";
  testConnection(creds: ResolvedCredential, opts?: { modelId?: string }): Promise<TestResult>;
  listModels(creds: ResolvedCredential): Promise<DiscoveredModel[]>;
  streamChat(creds: ResolvedCredential, req: StreamRequest, signal: AbortSignal): AsyncGenerator<StreamEvent>;
  generateText(
    creds: ResolvedCredential,
    req: StreamRequest,
    timeoutMs?: number
  ): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }>;
}

/* ─── shared HTTP error mapping ─────────────────────────────────────────── */

export type ProviderFailure = {
  code: string;
  message: string;
  retryable: boolean;
  status?: number;
};

export function mapProviderError(providerName: string, status: number | undefined, bodyText: string): ProviderFailure {
  const bodySnippet = bodyText.slice(0, 300).replace(/sk-[A-Za-z0-9_\-]{8,}/g, "sk-[redacted]");
  let detail = bodySnippet;
  try {
    const parsed = JSON.parse(bodySnippet) as Record<string, unknown>;
    const errObj = (parsed.error ?? parsed) as Record<string, unknown>;
    if (typeof errObj.message === "string") detail = errObj.message;
    else if (errObj.error && typeof errObj.error === "object" && typeof (errObj.error as Record<string, unknown>).message === "string")
      detail = String((errObj.error as Record<string, unknown>).message);
  } catch {
    /* not JSON — keep snippet */
  }
  switch (status) {
    case 401:
    case 403:
      return { code: "auth_failed", message: `${providerName} rejected the credentials (invalid or expired API key).`, retryable: false, status };
    case 404:
      return { code: "not_found", message: `${providerName} returned 404 — the base URL or model ID is likely incorrect.`, retryable: false, status };
    case 400:
    case 422:
      return { code: "bad_request", message: `${providerName} rejected the request: ${detail}`, retryable: false, status };
    case 429:
      return { code: "rate_limited", message: `${providerName} rate limit reached. Wait a moment and try again.`, retryable: true, status };
    case 408:
      return { code: "timeout", message: `${providerName} timed out.`, retryable: true, status };
    default:
      if (status && status >= 500)
        return { code: "provider_unavailable", message: `${providerName} is unavailable (HTTP ${status}).`, retryable: true, status };
      return { code: "provider_error", message: `${providerName} request failed: ${detail}`, retryable: !status, status };
  }
}

export function networkFailure(providerName: string, err: unknown): ProviderFailure {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("aborted") || msg.includes("timeout") || /timeout/i.test(msg))
    return { code: "timeout", message: `${providerName} did not respond in time.`, retryable: true };
  return {
    code: "network_error",
    message: `Could not reach ${providerName}. Check the base URL and your network connection.`,
    retryable: true,
  };
}

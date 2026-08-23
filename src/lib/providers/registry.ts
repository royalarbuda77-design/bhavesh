import type { Capabilities, DiscoveredModel, ModelLabels, ProviderId, TriState } from "./types";

/**
 * Provider registry: static metadata about each supported provider plus a
 * maintained capability knowledge base used when the provider does not expose
 * capability metadata itself. Unknown capabilities are NEVER guessed as true.
 */

export type ProviderDef = {
  id: ProviderId;
  name: string;
  protocol: "openai-completions" | "anthropic-messages" | "google-generative";
  defaultBaseUrl: string;
  baseUrlRequired: boolean;
  keyHint: string;
  docsUrl: string;
  signupUrl: string;
  description: string;
  discoverySupported: boolean;
};

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    protocol: "openai-completions",
    defaultBaseUrl: "https://api.openai.com/v1",
    baseUrlRequired: false,
    keyHint: "sk-...",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    signupUrl: "https://platform.openai.com/api-keys",
    description: "GPT models (gpt-4o, gpt-4.1, o3, o4-mini …)",
    discoverySupported: true,
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    protocol: "anthropic-messages",
    defaultBaseUrl: "https://api.anthropic.com",
    baseUrlRequired: false,
    keyHint: "sk-ant-...",
    docsUrl: "https://docs.anthropic.com/en/api",
    signupUrl: "https://console.anthropic.com/settings/keys",
    description: "Claude models (Sonnet, Opus, Haiku)",
    discoverySupported: true,
  },
  google: {
    id: "google",
    name: "Google Gemini",
    protocol: "google-generative",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    baseUrlRequired: false,
    keyHint: "AIza...",
    docsUrl: "https://ai.google.dev/api/rest",
    signupUrl: "https://aistudio.google.com/app/apikey",
    description: "Gemini models (2.5 Pro, 2.5 Flash …)",
    discoverySupported: true,
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    protocol: "openai-completions",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    baseUrlRequired: false,
    keyHint: "sk-or-...",
    docsUrl: "https://openrouter.ai/docs",
    signupUrl: "https://openrouter.ai/keys",
    description: "Gateway to hundreds of models from one key",
    discoverySupported: true,
  },
  groq: {
    id: "groq",
    name: "Groq",
    protocol: "openai-completions",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    baseUrlRequired: false,
    keyHint: "gsk_...",
    docsUrl: "https://console.groq.com/docs",
    signupUrl: "https://console.groq.com/keys",
    description: "Ultra-fast Llama, Mixtral and more",
    discoverySupported: true,
  },
  mistral: {
    id: "mistral",
    name: "Mistral",
    protocol: "openai-completions",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    baseUrlRequired: false,
    keyHint: "...",
    docsUrl: "https://docs.mistral.ai",
    signupUrl: "https://console.mistral.ai/api-keys",
    description: "Mistral Large, Small, Codestral, Pixtral",
    discoverySupported: true,
  },
  xai: {
    id: "xai",
    name: "xAI",
    protocol: "openai-completions",
    defaultBaseUrl: "https://api.x.ai/v1",
    baseUrlRequired: false,
    keyHint: "xai-...",
    docsUrl: "https://docs.x.ai",
    signupUrl: "https://console.x.ai",
    description: "Grok models",
    discoverySupported: true,
  },
  custom: {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    protocol: "openai-completions",
    defaultBaseUrl: "",
    baseUrlRequired: true,
    keyHint: "provider-specific",
    docsUrl: "https://platform.openai.com/docs/api-reference/chat",
    signupUrl: "",
    description: "Any endpoint implementing the OpenAI chat-completions API",
    discoverySupported: true,
  },
};

export function isProviderId(value: string): value is ProviderId {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

/* ─── capability knowledge base ─────────────────────────────────────────── */

const RX = (pattern: string, flags = "i") => new RegExp(pattern, flags);

const VISION_RULES: [RegExp, TriState][] = [
  [/^(gpt-4o|gpt-4\.1|gpt-4-turbo|chatgpt-4o|gpt-5)/, true],
  [/^(o3|o4-mini|o1)/, true],
  [/^claude-3/, true],
  [/^claude-(4|opus-4|sonnet-4|haiku-4)/, true],
  [/gemini-(1\.5|1\.0-pro-vision|2|3)/, true],
  [/vision|omni|pixtral|-vl|vl-|multimodal/, true],
  [/llama-?3\.2-(11b|90b)-vision|llama3.*vision/, true],
  [/grok-2-vision|grok-4/, true],
  [/qwen.*vl|qvq/, true],
  [/^gpt-3\.5|^gpt-4$|^text-|completion|embed|whisper|tts/, false],
  [/^claude-2|^claude-instant/, false],
];

const TOOL_RULES: [RegExp, TriState][] = [
  [/^(gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|chatgpt|o3|o4-mini|o1)/, true],
  [/^gpt-4(-[0-9]{4})?$/i, true],
  [/^claude-3/, true],
  [/^claude-(4|opus-4|sonnet-4|haiku-4)/, true],
  [/gemini-(1\.5|2|3)/, true],
  [/mistral-(large|medium|small|magistral|ministral)/, true],
  [/(codestral|pixtral)/, false],
  [/llama-?3\.[13]/, true],
  [/grok/, true],
  [/deepseek-chat|deepseek-v3/, true],
  [/deepseek-reasoner|deepseek-r1/, false],
  [/command-r/, true],
  [/qwen-[23]/, true],
  [/(embed|whisper|tts|rerank|guard|moderation)/, false],
  [/^gpt-3\.5-turbo/, true],
];

const REASONING_RULES: [RegExp, TriState][] = [
  [/^(o1|o3|o4-mini)/, true],
  [/gpt-5/, true],
  [/deepseek-r1|reasoner|reasoning/, true],
  [/thinking|extended-thinking/, true],
  [/claude-(3-7|3\.7|opus-4|sonnet-4)/, true],
  [/gemini-2\.5/, true],
  [/magistral/, true],
  [/grok-4/, true],
  [/qwen3|qwq/, true],
  [/^gpt-4o\b/, false],
  [/^gpt-4\.1\b/, false],
  [/^gpt-4-turbo/, false],
  [/^gpt-3\.5/, false],
  [/^claude-3(?!-7)/, false],
  [/^claude-2|claude-instant/, false],
  [/haiku/, false],
  [/^gpt-4(-[0-9]{4})?$/, false],
];

const STRUCTURED_RULES: [RegExp, TriState][] = [
  [/^(gpt-4o|gpt-4\.1|gpt-5|chatgpt-4o)/, true],
  [/^(o3|o4-mini)/, true],
  [/gemini-(1\.5|2|3)/, true],
  [/^gpt-3\.5/, false],
  [/embed|whisper|tts/, false],
];

const CONTEXT_RULES: [RegExp, number][] = [
  [/^gpt-4o-mini/, 128_000],
  [/^gpt-4o/, 128_000],
  [/^gpt-4\.1/, 1_047_576],
  [/^gpt-4-turbo/, 128_000],
  [/^gpt-4-1106/, 128_000],
  [/^o4-mini/, 200_000],
  [/^o3/, 200_000],
  [/^o1/, 200_000],
  [/^claude-opus-4/, 200_000],
  [/^claude-sonnet-4/, 200_000],
  [/^claude-3-7-sonnet/, 200_000],
  [/^claude-3-5-sonnet/, 200_000],
  [/^claude-3-5-haiku/, 200_000],
  [/^claude-3-opus/, 200_000],
  [/^claude-3-haiku/, 200_000],
  [/gemini-2\.5-pro/, 1_048_576],
  [/gemini-.*flash-lite/, 1_048_576],
  [/gemini-(1\.5|2\.5|2\.0)-pro/, 2_097_152],
  [/gemini-.*flash/, 1_048_576],
  [/llama-3\.1-405b/, 131_072],
  [/llama-3\.[123]/, 131_072],
  [/mixtral/, 32_768],
  [/mistral-large/, 131_072],
  [/deepseek-r1/, 163_840],
  [/deepseek-chat/, 65_536],
];

function matchRules(rules: [RegExp, TriState][], value: string): TriState {
  for (const [rx, val] of rules) if (rx.test(value)) return val;
  return null;
}

/**
 * Detect capabilities for a model. Provider metadata (hints) always wins over
 * the knowledge base; anything still unknown stays `null` (rendered as
 * "Unknown" in the UI and treated as unsupported for gating features).
 */
export function detectCapabilities(
  providerId: ProviderId,
  modelId: string,
  hints?: DiscoveredModel["hints"]
): { caps: Capabilities; labels: ModelLabels; contextWindow: number | null } {
  const id = modelId.toLowerCase();
  let vision: TriState = matchRules(VISION_RULES, id);
  let toolCalling: TriState = matchRules(TOOL_RULES, id);
  const reasoning: TriState = matchRules(REASONING_RULES, id);
  let structuredOutput: TriState = matchRules(STRUCTURED_RULES, id);

  if (providerId === "google" && hints?.methods) {
    const methods = hints.methods;
    if (!methods.includes("generateContent")) {
      return {
        caps: { text: false, streaming: false, vision: false, toolCalling: false, reasoning: false, structuredOutput: false, imageGeneration: false },
        labels: {},
        contextWindow: null,
      };
    }
    if (/gemini-(1\.5|2|3|pro-vision)/.test(id)) vision = true;
    if (/gemini-(1\.5|2|3)/.test(id)) toolCalling = true;
  }
  if (hints?.inputModalities?.length) vision = hints.inputModalities.includes("image");
  if (hints?.supportedParameters?.length) {
    if (hints.supportedParameters.includes("tools")) toolCalling = true;
    if (hints.supportedParameters.includes("tool_choice")) toolCalling = true;
    if (hints.supportedParameters.includes("response_format")) structuredOutput = true;
    if (hints.supportedParameters.includes("structured_outputs")) structuredOutput = true;
  }
  if (providerId === "custom") {
    // custom endpoints expose no metadata — leave unknowns as unknown
  }

  let contextWindow: number | null = null;
  for (const [rx, ctx] of CONTEXT_RULES) if (rx.test(id)) { contextWindow = ctx; break; }

  const labels: ModelLabels = {
    fast: /(flash|mini|haiku|nano|turbo|instant|8b|3b|small|lite)/.test(id) || undefined,
    coding: /(codestral|devstral|codegemma|starcoder|coder|codellama|-code\b|code-)/.test(id) || undefined,
  };

  return {
    caps: {
      text: true,
      streaming: true,
      vision,
      toolCalling,
      reasoning,
      structuredOutput,
      imageGeneration: false,
    },
    labels,
    contextWindow,
  };
}

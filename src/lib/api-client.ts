"use client";

import type { UserSettings } from "@/lib/auth";
import type { ModelDTO, CredentialDTO } from "@/lib/providers/manager";
import type { ConversationDTO, MessageDTO } from "@/lib/conversations";
import type { FileDTO } from "@/lib/files";
import type { SearchResult } from "@/lib/search";
import { parseSSE } from "./sse";

/** Client-side API helpers. All requests are same-origin with session cookies. */

export class ApiClientError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; code?: string };
    throw new ApiClientError(res.status, err.code ?? "error", err.error ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

/* ─── auth ───────────────────────────────────────────────────────────────── */

export type MeResponse = {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  settings: UserSettings;
  features: { googleLogin: boolean; webSearchConfigured: boolean; singleUser?: boolean };
};

export const authApi = {
  me: () => api<MeResponse>("/api/auth/me"),
  login: (email: string, password: string) =>
    api<{ user: MeResponse["user"] }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (name: string, email: string, password: string) =>
    api<{ user: MeResponse["user"] }>("/api/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  logout: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  forgotPassword: (email: string) =>
    api<{ ok: true; message: string }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    api<{ ok: true; message: string }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<{ ok: true }>("/api/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  updateName: (name: string) => api<{ ok: true; user: { name: string } }>("/api/auth/profile", { method: "POST", body: JSON.stringify({ name }) }),
};

/* ─── conversations ──────────────────────────────────────────────────────── */

export const conversationsApi = {
  list: (q?: string) => api<{ conversations: ConversationDTO[] }>(`/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  get: (id: string) => api<{ conversation: ConversationDTO; messages: MessageDTO[] }>(`/api/conversations/${id}`),
  create: () => api<{ conversation: ConversationDTO }>("/api/conversations", { method: "POST" }),
  update: (id: string, patch: { title?: string; pinned?: boolean; archived?: boolean }) =>
    api<{ conversation: ConversationDTO }>(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (id: string) => api<{ ok: true }>(`/api/conversations/${id}`, { method: "DELETE" }),
  share: (id: string) => api<{ conversation: ConversationDTO; url: string }>(`/api/conversations/${id}/share`, { method: "POST" }),
  unshare: (id: string) => api<{ conversation: ConversationDTO }>(`/api/conversations/${id}/share`, { method: "DELETE" }),
  feedback: (messageId: string, value: 1 | -1 | 0) =>
    api<{ message: MessageDTO }>(`/api/messages/${messageId}/feedback`, { method: "POST", body: JSON.stringify({ value }) }),
};

/* ─── providers & models ─────────────────────────────────────────────────── */

export type ProviderCatalogEntry = {
  id: string;
  name: string;
  description: string;
  defaultBaseUrl: string;
  baseUrlRequired: boolean;
  keyHint: string;
  docsUrl: string;
  signupUrl: string;
};

export const providersApi = {
  list: () => api<{ providers: CredentialDTO[]; catalog: ProviderCatalogEntry[] }>("/api/providers"),
  connect: (body: { providerId: string; label?: string; apiKey: string; baseUrl?: string; orgId?: string; projectId?: string }) =>
    api<{ ok: true; credentialId: string; providers: CredentialDTO[] }>("/api/providers", { method: "POST", body: JSON.stringify(body) }),
  test: (body: { credentialId?: string; providerId?: string; apiKey?: string; baseUrl?: string; modelId?: string }) =>
    api<{ ok: boolean; message: string; detail?: string; discoverySupported: boolean }>("/api/providers/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, patch: { enabled?: boolean; apiKey?: string; baseUrl?: string; orgId?: string; projectId?: string; label?: string }) =>
    api<{ ok: true }>(`/api/providers/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (id: string) => api<{ ok: true }>(`/api/providers/${id}`, { method: "DELETE" }),
  models: (id: string) => api<{ models: ModelDTO[] }>(`/api/providers/${id}/models`),
  discover: (id: string) => api<{ ok: true; models: ModelDTO[] }>(`/api/providers/${id}/models`, { method: "POST", body: JSON.stringify({ discover: true }) }),
  addManualModel: (id: string, modelId: string) =>
    api<{ ok: true; models: ModelDTO[] }>(`/api/providers/${id}/models`, { method: "POST", body: JSON.stringify({ modelId }) }),
};

export const modelsApi = {
  list: () => api<{ models: ModelDTO[]; defaultModelRef: string | null }>("/api/models"),
  setDefault: (ref: { credentialId: string; modelId: string } | null) =>
    api<{ ok: true; defaultModelRef: string | null }>("/api/models", { method: "POST", body: JSON.stringify({ ref }) }),
  setEnabled: (modelRowId: string, enabled: boolean) =>
    api<{ ok: true; models: ModelDTO[] }>("/api/models", { method: "POST", body: JSON.stringify({ modelRowId: modelRowId, enabled }) }),
};

/* ─── files ──────────────────────────────────────────────────────────────── */

export const filesApi = {
  list: () => api<{ files: FileDTO[] }>("/api/files"),
  upload: (file: File, conversationId?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    if (conversationId) form.append("conversationId", conversationId);
    return api<{ file: FileDTO }>("/api/files", { method: "POST", body: form });
  },
  get: (id: string) => api<{ file: FileDTO & { textContent: string | null } }>(`/api/files/${id}`),
  remove: (id: string) => api<{ ok: true }>(`/api/files/${id}`, { method: "DELETE" }),
};

/* ─── settings / search / agent ──────────────────────────────────────────── */

export const settingsApi = {
  get: () => api<{ settings: UserSettings }>("/api/settings"),
  patch: (patch: Partial<UserSettings>) => api<{ settings: UserSettings }>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
};

export const searchApi = {
  web: (query: string) =>
    api<{ ok: boolean; results?: SearchResult[]; provider: string; error?: string }>("/api/search", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),
};

export const agentApi = {
  tools: () =>
    api<{ tools: { name: string; description: string; permission: string; timeoutMs: number; parameters: unknown }[] }>("/api/agent"),
  run: (tool: string, args: Record<string, unknown>) =>
    api<{ ok: boolean; output: unknown; summary: string }>("/api/agent", { method: "POST", body: JSON.stringify({ tool, args }) }),
};

/* ─── streaming chat / compare ───────────────────────────────────────────── */

export type ChatStreamEvent =
  | { type: "start"; conversationId: string; title: string; userMessageId: string | null }
  | { type: "meta"; model: { modelId: string; displayName: string; providerId: string; providerLabel: string }; reason?: string; notice?: string }
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; ok: boolean; summary: string }
  | { type: "sources"; sources: SearchResult[] }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "notice"; message: string }
  | { type: "done"; messageId: string; latencyMs: number }
  | { type: "error"; message: string; code: string };

export type ChatRequest = {
  conversationId?: string;
  message?: string;
  attachmentIds?: string[];
  webSearch?: boolean;
  modelRef?: { credentialId: string; modelId: string } | null;
  autoRoute?: boolean;
  regenerate?: boolean;
};

export async function streamChat(body: ChatRequest, onEvent: (evt: ChatStreamEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `Chat request failed (${res.status}).`;
    let code = "error";
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data.error) message = data.error;
      if (data.code) code = data.code;
    } catch { /* keep default */ }
    onEvent({ type: "error", message, code });
    return;
  }
  for await (const evt of parseSSE(res.body)) {
    if (!evt.data) continue;
    try {
      onEvent(JSON.parse(evt.data) as ChatStreamEvent);
    } catch { /* skip malformed */ }
  }
}

export type CompareStreamEvent =
  | { type: "start"; ref: string; model: string; provider: string }
  | { type: "delta"; ref: string; text: string }
  | { type: "done"; ref: string; ms: number; usage?: { inputTokens?: number; outputTokens?: number } }
  | { type: "error"; ref: string; message: string };

export async function streamCompare(
  body: { message: string; refs: { credentialId: string; modelId: string }[] },
  onEvent: (evt: CompareStreamEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch("/api/compare", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `Compare request failed (${res.status}).`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch { /* keep default */ }
    onEvent({ type: "error", ref: "all", message });
    return;
  }
  for await (const evt of parseSSE(res.body)) {
    if (!evt.data) continue;
    try {
      onEvent(JSON.parse(evt.data) as CompareStreamEvent);
    } catch { /* skip */ }
  }
}

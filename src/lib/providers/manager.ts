import { all, get, run, nowMs, jsonParse } from "../db";
import { encryptSecret, decryptSecret, keyHint, last4 } from "../crypto";
import { PROVIDERS, detectCapabilities, isProviderId, type ProviderDef } from "./registry";
import type { ProviderId, Capabilities, ModelLabels, ResolvedCredential } from "./types";
import { OpenAICompatAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";
import { GoogleAdapter } from "./google";
import { log } from "../logger";

/**
 * AIProviderManager — the single place the rest of the app uses to talk to AI
 * providers. Resolves credentials (server-side decryption only), exposes the
 * ModelRegistry, and routes requests to the right ProviderAdapter.
 */

const openaiAdapter = new OpenAICompatAdapter();
const anthropicAdapter = new AnthropicAdapter();
const googleAdapter = new GoogleAdapter();

export function adapterFor(providerId: ProviderId) {
  const def = PROVIDERS[providerId];
  switch (def.protocol) {
    case "anthropic-messages":
      return anthropicAdapter;
    case "google-generative":
      return googleAdapter;
    default:
      return openaiAdapter;
  }
}

/* ─── CredentialManager ─────────────────────────────────────────────────── */

export function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

export function validateBaseUrl(providerId: ProviderId, raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const url = normalizeBaseUrl(raw);
  if (!url) return providerId === "custom" ? { ok: false, error: "Base URL is required for custom providers." } : { ok: true, url };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Base URL is not a valid URL." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Base URL must use http:// or https://." };
  }
  if (parsed.protocol === "http:") {
    const host = parsed.hostname;
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0" || host.endsWith(".local");
    if (!local) return { ok: false, error: "http:// base URLs are only allowed for local endpoints — use https:// for remote providers." };
  }
  return { ok: true, url };
}

export type CredentialDTO = {
  id: string;
  providerId: ProviderId;
  providerName: string;
  label: string;
  baseUrl: string;
  orgId: string | null;
  projectId: string | null;
  keyHint: string;
  status: string;
  enabled: boolean;
  lastTestedAt: number | null;
  lastTestMessage: string | null;
  createdAt: number;
  modelCount: number;
};

export function listCredentials(userId: string): CredentialDTO[] {
  const rows = all(
    `SELECT pc.*, (SELECT COUNT(*) FROM connected_models cm WHERE cm.credential_id = pc.id AND cm.enabled = 1) AS model_count
     FROM provider_credentials pc WHERE pc.user_id = ? ORDER BY pc.created_at ASC`,
    userId
  );
  return rows.map((r) => ({
    id: String(r.id),
    providerId: r.provider_id as ProviderId,
    providerName: r.provider_id === "custom" ? String(r.label) : PROVIDERS[r.provider_id as ProviderId].name,
    label: String(r.label),
    baseUrl: r.base_url ? String(r.base_url) : "",
    orgId: r.org_id ? String(r.org_id) : null,
    projectId: r.project_id ? String(r.project_id) : null,
    keyHint: String(r.key_hint),
    status: String(r.status),
    enabled: Number(r.enabled) === 1,
    lastTestedAt: r.last_tested_at ? Number(r.last_tested_at) : null,
    lastTestMessage: r.last_test_message ? String(r.last_test_message) : null,
    createdAt: Number(r.created_at),
    modelCount: Number(r.model_count),
  }));
}

export function getCredentialRow(userId: string, credentialId: string) {
  return get("SELECT * FROM provider_credentials WHERE id = ? AND user_id = ?", credentialId, userId);
}

export function resolveCredential(userId: string, credentialId: string): ResolvedCredential | null {
  const row = getCredentialRow(userId, credentialId);
  if (!row) return null;
  const providerId = row.provider_id as ProviderId;
  const def = PROVIDERS[providerId];
  return {
    credentialId: String(row.id),
    userId,
    providerId,
    label: String(row.label),
    baseUrl: row.base_url ? normalizeBaseUrl(String(row.base_url)) : def.defaultBaseUrl,
    apiKey: decryptSecret(String(row.api_key_enc)),
    orgId: row.org_id ? String(row.org_id) : null,
    projectId: row.project_id ? String(row.project_id) : null,
  };
}

export function saveCredential(
  userId: string,
  input: {
    providerId: ProviderId;
    label?: string;
    apiKey: string;
    baseUrl?: string;
    orgId?: string;
    projectId?: string;
    existingId?: string;
  }
): { ok: true; credentialId: string } | { ok: false; error: string } {
  const def = PROVIDERS[input.providerId];
  const apiKey = input.apiKey.trim();
  if (!apiKey) return { ok: false, error: "API key is required." };
  const urlCheck = validateBaseUrl(input.providerId, input.baseUrl ?? "");
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };
  const baseUrl = urlCheck.url || def.defaultBaseUrl;
  const label =
    (input.label ?? "").trim() ||
    (input.providerId === "custom" ? "Custom Provider" : def.name);

  const enc = encryptSecret(apiKey);
  const ts = nowMs();
  if (input.existingId) {
    const existing = getCredentialRow(userId, input.existingId);
    if (!existing) return { ok: false, error: "Provider not found." };
    run(
      `UPDATE provider_credentials SET provider_id=?, label=?, base_url=?, org_id=?, project_id=?, api_key_enc=?, key_hint=?, key_last4=?, status='connected', updated_at=? WHERE id=? AND user_id=?`,
      input.providerId,
      label,
      input.baseUrl ? baseUrl : null,
      input.orgId?.trim() || null,
      input.projectId?.trim() || null,
      enc,
      keyHint(apiKey),
      last4(apiKey),
      ts,
      input.existingId,
      userId
    );
    return { ok: true, credentialId: input.existingId };
  }
  const id = crypto.randomUUID();
  run(
    `INSERT INTO provider_credentials (id, user_id, provider_id, label, base_url, org_id, project_id, api_key_enc, key_hint, key_last4, status, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'connected',1,?,?)`,
    id,
    userId,
    input.providerId,
    label,
    input.baseUrl ? baseUrl : null,
    input.orgId?.trim() || null,
    input.projectId?.trim() || null,
    enc,
    keyHint(apiKey),
    last4(apiKey),
    ts,
    ts
  );
  return { ok: true, credentialId: id };
}

export function deleteCredential(userId: string, credentialId: string): boolean {
  const row = getCredentialRow(userId, credentialId);
  if (!row) return false;
  run("DELETE FROM provider_credentials WHERE id = ? AND user_id = ?", credentialId, userId);
  return true;
}

export function setCredentialEnabled(userId: string, credentialId: string, enabled: boolean): boolean {
  const row = getCredentialRow(userId, credentialId);
  if (!row) return false;
  run("UPDATE provider_credentials SET enabled=?, updated_at=? WHERE id=? AND user_id=?", enabled ? 1 : 0, nowMs(), credentialId, userId);
  return true;
}

export async function testCredential(
  userId: string,
  input: { credentialId?: string; providerId?: ProviderId; apiKey?: string; baseUrl?: string; modelId?: string }
): Promise<{ ok: boolean; message: string; detail?: string; discoverySupported: boolean }> {
  let creds: ResolvedCredential | null = null;
  let savedId: string | undefined;
  if (input.credentialId) {
    creds = resolveCredential(userId, input.credentialId);
    savedId = input.credentialId;
    if (!creds) return { ok: false, message: "Provider not found.", discoverySupported: false };
  } else {
    if (!input.providerId || !isProviderId(input.providerId))
      return { ok: false, message: "Select a provider first.", discoverySupported: false };
    const urlCheck = validateBaseUrl(input.providerId, input.baseUrl ?? "");
    if (!urlCheck.ok) return { ok: false, message: urlCheck.error, discoverySupported: false };
    creds = {
      credentialId: "draft",
      userId,
      providerId: input.providerId,
      label: input.providerId === "custom" ? "Custom Provider" : PROVIDERS[input.providerId].name,
      baseUrl: urlCheck.url || PROVIDERS[input.providerId].defaultBaseUrl,
      apiKey: (input.apiKey ?? "").trim(),
      orgId: null,
      projectId: null,
    };
    if (!creds.apiKey) return { ok: false, message: "Enter your API key before testing.", discoverySupported: false };
  }
  const result = await adapterFor(creds.providerId).testConnection(creds, { modelId: input.modelId });
  if (savedId) {
    run(
      "UPDATE provider_credentials SET status=?, last_tested_at=?, last_test_message=? WHERE id=? AND user_id=?",
      result.ok ? "connected" : "error",
      nowMs(),
      result.message,
      savedId,
      userId
    );
  }
  log.info({ userId, provider: creds.providerId, reqId: undefined }, `connection test ${result.ok ? "ok" : "failed"}`);
  return result;
}

/* ─── ModelRegistry ─────────────────────────────────────────────────────── */

export type ModelDTO = {
  id: string; // registry row id
  credentialId: string;
  providerId: ProviderId;
  providerLabel: string;
  modelId: string;
  displayName: string;
  capabilities: Capabilities;
  labels: ModelLabels;
  contextWindow: number | null;
  pricing: { promptPer1M?: number; completionPer1M?: number } | null;
  enabled: boolean;
  source: string;
  lastSeen: number;
};

function rowToModel(r: Record<string, unknown>): ModelDTO {
  const caps = jsonParse<Capabilities>(r.capabilities_json, {
    text: true, streaming: true, vision: null, toolCalling: null, reasoning: null, structuredOutput: null, imageGeneration: false,
  });
  return {
    id: String(r.id),
    credentialId: String(r.credential_id),
    providerId: r.provider_id as ProviderId,
    providerLabel: String(r.provider_label),
    modelId: String(r.model_id),
    displayName: String(r.display_name),
    capabilities: caps,
    labels: jsonParse<ModelLabels>(r.labels_json, {}),
    contextWindow: r.context_window != null ? Number(r.context_window) : null,
    pricing: jsonParse<ModelDTO["pricing"]>(r.pricing_json, null),
    enabled: Number(r.enabled) === 1,
    source: String(r.source),
    lastSeen: Number(r.last_seen),
  };
}

export function listModels(userId: string): ModelDTO[] {
  const rows = all(
    `SELECT cm.*, pc.provider_id AS provider_id, pc.label AS provider_label, pc.enabled AS provider_enabled
     FROM connected_models cm JOIN provider_credentials pc ON pc.id = cm.credential_id
     WHERE cm.user_id = ?
     ORDER BY pc.created_at ASC, cm.display_name ASC`,
    userId
  );
  return rows.filter((r) => Number(r.provider_enabled) === 1).map(rowToModel);
}

export function getModel(userId: string, credentialId: string, modelId: string): ModelDTO | null {
  const row = get(
    `SELECT cm.*, pc.provider_id AS provider_id, pc.label AS provider_label, pc.enabled AS provider_enabled
     FROM connected_models cm JOIN provider_credentials pc ON pc.id = cm.credential_id
     WHERE cm.user_id = ? AND cm.credential_id = ? AND cm.model_id = ?`,
    userId,
    credentialId,
    modelId
  );
  if (!row || Number(row.provider_enabled) !== 1) return null;
  return rowToModel(row);
}

export async function discoverModels(userId: string, credentialId: string): Promise<{ ok: true; models: ModelDTO[] } | { ok: false; error: string }> {
  const creds = resolveCredential(userId, credentialId);
  if (!creds) return { ok: false, error: "Provider not found." };
  let discovered;
  try {
    discovered = await adapterFor(creds.providerId).listModels(creds);
  } catch (err) {
    const failure = err as Error & { code?: string; message: string };
    return { ok: false, error: failure.message || "Model discovery failed." };
  }
  const ts = nowMs();
  for (const m of discovered) {
    const { caps, labels, contextWindow } = detectCapabilities(creds.providerId, m.modelId, m.hints);
    const existing = get(
      "SELECT id FROM connected_models WHERE user_id=? AND credential_id=? AND model_id=?",
      userId,
      credentialId,
      m.modelId
    );
    if (existing) {
      run(
        "UPDATE connected_models SET display_name=?, capabilities_json=?, context_window=COALESCE(?, context_window), pricing_json=?, labels_json=?, last_seen=? WHERE id=?",
        m.displayName,
        JSON.stringify(caps),
        m.contextWindow ?? contextWindow ?? null,
        m.pricing ? JSON.stringify(m.pricing) : null,
        JSON.stringify(labels),
        ts,
        String(existing.id)
      );
    } else {
      run(
        "INSERT INTO connected_models (id, user_id, credential_id, model_id, display_name, capabilities_json, context_window, pricing_json, labels_json, enabled, source, last_seen) VALUES (?,?,?,?,?,?,?,?,?,1,'discovered',?)",
        crypto.randomUUID(),
        userId,
        credentialId,
        m.modelId,
        m.displayName,
        JSON.stringify(caps),
        m.contextWindow ?? contextWindow ?? null,
        m.pricing ? JSON.stringify(m.pricing) : null,
        JSON.stringify(labels),
        ts
      );
    }
  }
  log.info({ userId, provider: creds.providerId }, `discovered ${discovered.length} models`);
  return { ok: true, models: listModelsForCredential(userId, credentialId) };
}

export function listModelsForCredential(userId: string, credentialId: string): ModelDTO[] {
  const rows = all(
    `SELECT cm.*, pc.provider_id AS provider_id, pc.label AS provider_label
     FROM connected_models cm JOIN provider_credentials pc ON pc.id = cm.credential_id
     WHERE cm.user_id = ? AND cm.credential_id = ? ORDER BY cm.display_name ASC`,
    userId,
    credentialId
  );
  return rows.map(rowToModel);
}

export function setModelEnabled(userId: string, modelRowId: string, enabled: boolean): boolean {
  const row = get("SELECT id FROM connected_models WHERE id = ? AND user_id = ?", modelRowId, userId);
  if (!row) return false;
  run("UPDATE connected_models SET enabled=? WHERE id=?", enabled ? 1 : 0, modelRowId);
  return true;
}

/** Register a manually-entered model id for a credential (used when discovery is unavailable). */
export function registerManualModel(userId: string, credentialId: string, modelId: string): ModelDTO | null {
  const row = get("SELECT * FROM provider_credentials WHERE id = ? AND user_id = ?", credentialId, userId);
  if (!row) return null;
  const providerId = row.provider_id as ProviderId;
  const { caps, labels, contextWindow } = detectCapabilities(providerId, modelId);
  const existing = get("SELECT id FROM connected_models WHERE user_id=? AND credential_id=? AND model_id=?", userId, credentialId, modelId);
  if (existing) {
    run("UPDATE connected_models SET enabled=1, last_seen=? WHERE id=?", nowMs(), String(existing.id));
  } else {
    run(
      "INSERT INTO connected_models (id, user_id, credential_id, model_id, display_name, capabilities_json, context_window, labels_json, enabled, source, last_seen) VALUES (?,?,?,?,?,?,?,?,1,'manual',?)",
      crypto.randomUUID(),
      userId,
      credentialId,
      modelId,
      modelId,
      JSON.stringify(caps),
      contextWindow,
      JSON.stringify(labels),
      nowMs()
    );
  }
  return getModel(userId, credentialId, modelId);
}

export { PROVIDERS, detectCapabilities, isProviderId };
export type { ProviderDef };

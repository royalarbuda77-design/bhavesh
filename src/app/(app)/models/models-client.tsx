"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Star,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import type { CredentialDTO, ModelDTO } from "@/lib/providers/manager";
import { modelsApi, providersApi, type ProviderCatalogEntry } from "@/lib/api-client";
import { useApp } from "@/components/app-shell";
import { Badge, Button, Dropdown, EmptyState, Input, Label, MenuItem, Modal, Skeleton, Toggle, useToast } from "@/components/ui";

const PROVIDER_INITIALS: Record<string, string> = {
  openai: "OA", anthropic: "AN", google: "GG", openrouter: "OR", groq: "GQ", mistral: "MI", xai: "XAI", custom: "CU",
};

type TestState = { status: "idle" | "testing" | "ok" | "error"; message?: string; detail?: string; discoverySupported?: boolean };

export function ModelsClient() {
  const { refreshModels, refreshConversations } = useApp();
  const { push } = useToast();
  const [providers, setProviders] = useState<CredentialDTO[]>([]);
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([]);
  const [models, setModels] = useState<ModelDTO[]>([]);
  const [defaultRef, setDefaultRef] = useState<{ credentialId: string; modelId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CredentialDTO | null>(null);
  const [modelsFor, setModelsFor] = useState<CredentialDTO | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([providersApi.list(), modelsApi.list()]);
      setProviders(p.providers);
      setCatalog(p.catalog);
      setModels(m.models);
      setDefaultRef(m.defaultModelRef ? JSON.parse(m.defaultModelRef) : null);
      await refreshModels();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to load providers.", "error");
    } finally {
      setLoading(false);
    }
  }, [push, refreshModels]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const removeProvider = async (cred: CredentialDTO) => {
    if (!window.confirm(`Remove ${cred.providerName} and its saved key? Chats stay, but its models stop being available.`)) return;
    try {
      await providersApi.remove(cred.id);
      push(`${cred.providerName} removed.`, "success");
      await reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Remove failed.", "error");
    }
  };

  const toggleProvider = async (cred: CredentialDTO, enabled: boolean) => {
    setProviders((prev) => prev.map((p) => (p.id === cred.id ? { ...p, enabled } : p)));
    try {
      await providersApi.update(cred.id, { enabled });
      await reload();
    } catch {
      push("Could not update provider.", "error");
      await reload();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-surface-border px-4 sm:px-6">
        <Cpu size={18} className="text-accent" aria-hidden />
        <h1 className="text-[15px] font-semibold text-ink-primary">AI Providers &amp; Models</h1>
        <div className="ml-auto">
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus size={15} aria-hidden /> Add provider
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-10 px-4 py-6 sm:px-6">
          {/* connected providers */}
          <section aria-labelledby="connected-providers">
            <h2 id="connected-providers" className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              Connected providers
            </h2>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : providers.length === 0 ? (
              <EmptyState
                icon={<Plug size={28} aria-hidden />}
                title="No providers connected"
                description="Add your first provider to unlock model discovery and chat. Your API keys are encrypted (AES-256-GCM) and never leave the server in plaintext."
                action={
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus size={15} aria-hidden /> Add provider
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {providers.map((cred) => (
                  <ProviderCard
                    key={cred.id}
                    cred={cred}
                    onConfigure={() => {
                      setEditing(cred);
                      setAddOpen(true);
                    }}
                    onModels={() => setModelsFor(cred)}
                    onRemove={() => void removeProvider(cred)}
                    onToggle={(v) => void toggleProvider(cred, v)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* available models */}
          <section aria-labelledby="available-models">
            <h2 id="available-models" className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              Available models ({models.length})
            </h2>
            <AvailableModels
              models={models}
              defaultRef={defaultRef}
              onChanged={async () => {
                const m = await modelsApi.list();
                setModels(m.models);
                setDefaultRef(m.defaultModelRef ? JSON.parse(m.defaultModelRef) : null);
                await refreshModels();
              }}
            />
          </section>
        </div>
      </div>

      <ProviderModal
        open={addOpen}
        editing={editing}
        catalog={catalog}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setAddOpen(false);
          setEditing(null);
          await reload();
          await refreshConversations();
          push("Provider saved.", "success");
        }}
      />

      <ProviderModelsModal
        cred={modelsFor}
        onClose={() => setModelsFor(null)}
        onChanged={reload}
      />
    </div>
  );
}

/* ─── provider card ──────────────────────────────────────────────────────── */

function ProviderCard({
  cred,
  onConfigure,
  onModels,
  onRemove,
  onToggle,
}: {
  cred: CredentialDTO;
  onConfigure: () => void;
  onModels: () => void;
  onRemove: () => void;
  onToggle: (v: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ok = cred.status === "connected";
  return (
    <div className={`rounded-2xl border bg-surface-raised p-4 shadow-subtle ${cred.enabled ? "border-surface-border" : "border-surface-border opacity-70"}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-[12px] font-bold text-accent" aria-hidden>
          {PROVIDER_INITIALS[cred.providerId] ?? "AI"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[14.5px] font-semibold text-ink-primary">{cred.providerName}</h3>
            <span className={`inline-flex items-center gap-1 text-[11.5px] ${ok ? "text-success" : "text-danger"}`}>
              {ok ? <CheckCircle2 size={12} aria-hidden /> : <TriangleAlert size={12} aria-hidden />}
              {ok ? "Connected" : "Error"}
            </span>
          </div>
          <p className="mt-0.5 truncate font-mono text-[11.5px] text-ink-tertiary" title="API key hint (never the full key)">
            {cred.keyHint}
          </p>
          {cred.baseUrl ? <p className="mt-0.5 truncate text-[11.5px] text-ink-tertiary">{cred.baseUrl}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Toggle checked={cred.enabled} onChange={onToggle} label={`Enable ${cred.providerName}`} />
          <div className="relative">
            <button
              aria-label={`Options for ${cred.providerName}`}
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md p-1.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary"
            >
              <ChevronDown size={16} />
            </button>
            <Dropdown open={menuOpen} onClose={() => setMenuOpen(false)}>
              <MenuItem icon={<Trash2 size={14} />} danger onClick={() => { setMenuOpen(false); onRemove(); }}>
                Remove
              </MenuItem>
            </Dropdown>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onConfigure}>
          <Settings2 size={13} aria-hidden /> Configure
        </Button>
        <Button size="sm" variant="secondary" onClick={onModels}>
          <Bot size={13} aria-hidden /> Models ({cred.modelCount})
        </Button>
        {cred.lastTestMessage ? (
          <span className="min-w-0 flex-1 truncate text-right text-[11px] text-ink-tertiary" title={cred.lastTestMessage}>
            {cred.lastTestMessage}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ─── add/edit provider modal ────────────────────────────────────────────── */

function ProviderModal({
  open,
  editing,
  catalog,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: CredentialDTO | null;
  catalog: ProviderCatalogEntry[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { push } = useToast();
  const [providerId, setProviderId] = useState("openai");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [showBaseUrl, setShowBaseUrl] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [modelId, setModelId] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const [discovered, setDiscovered] = useState<ModelDTO[] | null>(null);
  const [discovering, setDiscovering] = useState(false);

  const entry = catalog.find((c) => c.id === providerId);
  const isCustom = providerId === "custom";

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setProviderId(editing.providerId);
      setLabel(editing.providerId === "custom" ? editing.label : "");
      setApiKey("");
      setBaseUrl(editing.baseUrl);
      setShowBaseUrl(Boolean(editing.baseUrl));
      setOrgId(editing.orgId ?? "");
      setProjectId(editing.projectId ?? "");
      setAdvanced(Boolean(editing.orgId || editing.projectId));
    } else {
      setProviderId("openai");
      setLabel("");
      setApiKey("");
      setBaseUrl("");
      setShowBaseUrl(false);
      setOrgId("");
      setProjectId("");
      setAdvanced(false);
    }
    setModelId("");
    setShowKey(false);
    setTest({ status: "idle" });
    setDiscovered(null);
  }, [open, editing]);

  const runTest = async () => {
    setTest({ status: "testing" });
    setDiscovered(null);
    try {
      const result = editing && !apiKey
        ? await providersApi.test({ credentialId: editing.id, modelId: modelId || undefined })
        : await providersApi.test({ providerId, apiKey, baseUrl: showBaseUrl || isCustom ? baseUrl : undefined, modelId: modelId || undefined });
      setTest({
        status: result.ok ? "ok" : "error",
        message: result.message,
        detail: result.detail,
        discoverySupported: result.discoverySupported,
      });
    } catch (err) {
      setTest({ status: "error", message: err instanceof Error ? err.message : "Test failed." });
    }
  };

  const runDiscover = async () => {
    let credentialId = editing?.id;
    if (!credentialId) {
      // save first, then discover
      setSaving(true);
      try {
        const saved = await providersApi.connect({
          providerId,
          label: label || undefined,
          apiKey,
          baseUrl: showBaseUrl || isCustom ? baseUrl : undefined,
          orgId: orgId || undefined,
          projectId: projectId || undefined,
        });
        credentialId = saved.credentialId;
      } catch (err) {
        setSaving(false);
        push(err instanceof Error ? err.message : "Could not save provider.", "error");
        return;
      }
      setSaving(false);
    }
    setDiscovering(true);
    try {
      const result = await providersApi.discover(credentialId);
      setDiscovered(result.models);
      setTest({ status: "ok", message: `Discovered ${result.models.length} models.`, discoverySupported: true });
      await onSavedRef.current?.();
    } catch (err) {
      setTest({ status: "error", message: err instanceof Error ? err.message : "Discovery failed." });
    } finally {
      setDiscovering(false);
    }
  };

  const onSavedRef = useRef<(() => Promise<void>) | null>(null);
  onSavedRef.current = onSaved;

  const save = async () => {
    setSaving(true);
    try {
      if (editing && !apiKey) {
        // keep existing key, update other fields
        await providersApi.update(editing.id, {
          label: label || undefined,
          baseUrl: showBaseUrl || isCustom ? baseUrl : undefined,
          orgId: orgId || undefined,
          projectId: projectId || undefined,
          enabled: editing.enabled,
        });
      } else {
        if (!apiKey.trim()) {
          push("Enter your API key.", "error");
          setSaving(false);
          return;
        }
        await providersApi.connect({
          providerId,
          label: label || undefined,
          apiKey: apiKey.trim(),
          baseUrl: showBaseUrl || isCustom ? baseUrl : undefined,
          orgId: orgId || undefined,
          projectId: projectId || undefined,
        });
      }
      if (modelId.trim() && (editing || true)) {
        // register manual model on the saved credential
        const list = await providersApi.list();
        const cred = list.providers.find((p) => p.providerId === providerId && (!label || p.label === (label || p.label)));
        // use most recent matching connection
        const match = list.providers.filter((p) => p.providerId === providerId).pop();
        if (match) await providersApi.addManualModel(match.id, modelId.trim()).catch(() => undefined);
      }
      await onSaved();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not save provider.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Configure ${editing.providerName}` : "Add provider"}
      description="Your key is encrypted with AES-256-GCM and stored server-side. It is never sent back to the browser."
      footer={
        <>
          <Button variant="secondary" onClick={runTest} disabled={test.status === "testing" || (!editing && !apiKey.trim())}>
            {test.status === "testing" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <PlugZap size={14} aria-hidden />}
            Test Connection
          </Button>
          <Button variant="secondary" onClick={runDiscover} disabled={discovering || (!editing && !apiKey.trim())}>
            {discovering ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
            Discover Models
          </Button>
          <Button onClick={save} loading={saving} disabled={!editing && !apiKey.trim()}>
            Save Provider
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="prov-provider">Provider</Label>
          <select
            id="prov-provider"
            value={providerId}
            disabled={Boolean(editing)}
            onChange={(e) => {
              setProviderId(e.target.value);
              setTest({ status: "idle" });
              setDiscovered(null);
              setShowBaseUrl(e.target.value === "custom");
            }}
            className="h-10 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-ink-primary focus:border-accent focus:outline-none disabled:opacity-60"
          >
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {entry ? (
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-tertiary">
              {entry.description}{" "}
              {entry.signupUrl ? (
                <a href={entry.signupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
                  Get an API key <ExternalLink size={10} aria-hidden />
                </a>
              ) : null}
            </p>
          ) : null}
        </div>

        {isCustom ? (
          <div>
            <Label htmlFor="prov-label">Provider name</Label>
            <Input id="prov-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My local LLM" />
          </div>
        ) : null}

        <div>
          <Label htmlFor="prov-key" hint={editing ? "(leave blank to keep the current key)" : undefined}>
            API key
          </Label>
          <div className="relative">
            <Input
              id="prov-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTest({ status: "idle" });
              }}
              placeholder={editing ? credPlaceholder(editing) : entry ? `e.g. ${entry.keyHint}` : ""}
              autoComplete="off"
              className="pr-24 font-mono"
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
              <button type="button" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? "Hide API key" : "Show API key"} className="rounded-md p-1.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button type="button" onClick={() => void navigator.clipboard.writeText(apiKey).then(() => push("Copied to clipboard.", "success")).catch(() => undefined)} aria-label="Copy API key" disabled={!apiKey} className="rounded-md p-1.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary disabled:opacity-40">
                <Copy size={14} />
              </button>
              <button type="button" onClick={() => setApiKey("")} aria-label="Clear API key" disabled={!apiKey} className="rounded-md p-1.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary disabled:opacity-40">
                <X size={14} />
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-[11.5px] text-ink-tertiary">Saved keys are shown only as {`\u2022`} hints — the full value never returns to the browser.</p>
        </div>

        {isCustom || showBaseUrl ? (
          <div>
            <Label htmlFor="prov-base">Base URL {isCustom ? "" : "(override)"}</Label>
            <Input id="prov-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={entry?.defaultBaseUrl || "https://example.com/v1"} className="font-mono text-[13px]" />
            {isCustom ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-tertiary">
                Must implement the OpenAI chat-completions API. Compatibility is verified during the connection test — we never fake it.
              </p>
            ) : null}
          </div>
        ) : (
          <button type="button" onClick={() => setShowBaseUrl(true)} className="text-[12.5px] text-accent hover:underline">
            Use a custom base URL
          </button>
        )}

        <button type="button" onClick={() => setAdvanced((v) => !v)} className="flex items-center gap-1 text-[12.5px] font-medium text-ink-secondary hover:text-ink-primary" aria-expanded={advanced}>
          <ChevronDown size={13} className={`transition-transform ${advanced ? "rotate-180" : ""}`} aria-hidden /> Advanced options
        </button>
        {advanced ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="prov-org">Organization ID (optional)</Label>
              <Input id="prov-org" value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="org-…" className="font-mono text-[13px]" />
            </div>
            <div>
              <Label htmlFor="prov-project">Project ID (optional)</Label>
              <Input id="prov-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="proj_…" className="font-mono text-[13px]" />
            </div>
          </div>
        ) : null}

        <div>
          <Label htmlFor="prov-model" hint="(optional — add manually if discovery is unavailable)">
            Model ID
          </Label>
          <Input id="prov-model" value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="e.g. custom-model-name" className="font-mono text-[13px]" />
        </div>

        {test.status !== "idle" ? (
          <div
            role="status"
            className={`rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed ${
              test.status === "ok" ? "border-success/30 bg-success/5" : test.status === "error" ? "border-danger/30 bg-danger/5" : "border-surface-border bg-surface-raised"
            }`}
          >
            <div className="flex items-start gap-2">
              {test.status === "testing" ? (
                <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-accent" aria-hidden />
              ) : test.status === "ok" ? (
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" aria-hidden />
              ) : (
                <TriangleAlert size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden />
              )}
              <div className="min-w-0">
                <p className={`font-medium ${test.status === "ok" ? "text-success" : test.status === "error" ? "text-danger" : "text-ink-secondary"}`}>
                  {test.status === "testing" ? "Testing connection…" : test.message}
                </p>
                {test.detail ? <p className="mt-0.5 text-[12px] text-ink-secondary">{test.detail}</p> : null}
              </div>
            </div>
          </div>
        ) : null}

        {discovered ? (
          <DiscoveredTable models={discovered} providerName={editing?.providerName ?? entry?.name ?? ""} />
        ) : null}
      </div>
    </Modal>
  );
}

function credPlaceholder(cred: CredentialDTO): string {
  return `${cred.keyHint} (saved)`;
}

function capCell(v: boolean | null): { text: string; tone: "success" | "warning" | "neutral" } {
  if (v === true) return { text: "✓", tone: "success" };
  if (v === false) return { text: "✕", tone: "neutral" };
  return { text: "Unknown", tone: "warning" };
}

function DiscoveredTable({ models, providerName }: { models: ModelDTO[]; providerName: string }) {
  if (models.length === 0) return <p className="text-[13px] text-ink-secondary">No models returned. You can still add a Model ID manually.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full min-w-[480px] text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-surface-border bg-surface-raised text-ink-secondary">
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium">Provider</th>
            <th className="px-3 py-2 text-center font-medium">Vision</th>
            <th className="px-3 py-2 text-center font-medium">Tools</th>
            <th className="px-3 py-2 text-center font-medium">Streaming</th>
            <th className="px-3 py-2 text-center font-medium">Reasoning</th>
          </tr>
        </thead>
        <tbody>
          {models.slice(0, 50).map((m) => {
            const vision = capCell(m.capabilities.vision);
            const tools = capCell(m.capabilities.toolCalling);
            const reasoning = capCell(m.capabilities.reasoning);
            return (
              <tr key={m.id} className="border-b border-surface-border last:border-0">
                <td className="max-w-56 truncate px-3 py-2 font-mono text-[12px] text-ink-primary" title={m.modelId}>
                  {m.modelId}
                </td>
                <td className="px-3 py-2 text-ink-secondary">{providerName}</td>
                <td className="px-3 py-2 text-center">
                  <Badge tone={vision.tone}>{vision.text}</Badge>
                </td>
                <td className="px-3 py-2 text-center">
                  <Badge tone={tools.tone}>{tools.text}</Badge>
                </td>
                <td className="px-3 py-2 text-center">
                  <Badge tone="success">✓</Badge>
                </td>
                <td className="px-3 py-2 text-center">
                  <Badge tone={reasoning.tone}>{reasoning.text}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {models.length > 50 ? <p className="px-3 py-2 text-[11.5px] text-ink-tertiary">+{models.length - 50} more in Available models below.</p> : null}
    </div>
  );
}

/* ─── provider models modal ──────────────────────────────────────────────── */

function ProviderModelsModal({ cred, onClose, onChanged }: { cred: CredentialDTO | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const { push } = useToast();
  const [models, setModels] = useState<ModelDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [manualId, setManualId] = useState("");

  const load = useCallback(async () => {
    if (!cred) return;
    setLoading(true);
    try {
      const data = await providersApi.models(cred.id);
      setModels(data.models);
    } catch {
      push("Could not load models.", "error");
    } finally {
      setLoading(false);
    }
  }, [cred, push]);

  useEffect(() => {
    void load();
  }, [load]);

  const discover = async () => {
    if (!cred) return;
    setDiscovering(true);
    try {
      const result = await providersApi.discover(cred.id);
      setModels(result.models);
      push(`Discovered ${result.models.length} models.`, "success");
      await onChanged();
    } catch (err) {
      push(err instanceof Error ? err.message : "Discovery failed.", "error");
    } finally {
      setDiscovering(false);
    }
  };

  const addManual = async () => {
    if (!cred || !manualId.trim()) return;
    try {
      const result = await providersApi.addManualModel(cred.id, manualId.trim());
      setModels(result.models);
      setManualId("");
      await onChanged();
      push(`Model ${manualId.trim()} added.`, "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not add model.", "error");
    }
  };

  return (
    <Modal
      open={Boolean(cred)}
      onClose={onClose}
      title={`Models — ${cred?.providerName ?? ""}`}
      description="Capabilities come from provider metadata where available, or a maintained registry. Unknown means unknown — never assumed."
      footer={
        <>
          <Button variant="secondary" onClick={discover} loading={discovering}>
            <RefreshCw size={14} aria-hidden /> Discover models
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="Add model ID manually (e.g. custom-model-name)" className="font-mono text-[13px]" aria-label="Model ID" />
          <Button variant="secondary" onClick={addManual} disabled={!manualId.trim()}>
            Add
          </Button>
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <DiscoveredTable models={models} providerName={cred?.providerName ?? ""} />
        )}
      </div>
    </Modal>
  );
}

/* ─── available models ───────────────────────────────────────────────────── */

const FILTERS = [
  { id: "all", label: "All" },
  { id: "vision", label: "Vision" },
  { id: "reasoning", label: "Reasoning" },
  { id: "tools", label: "Tools" },
  { id: "fast", label: "Fast" },
  { id: "coding", label: "Coding" },
] as const;

function AvailableModels({
  models,
  defaultRef,
  onChanged,
}: {
  models: ModelDTO[];
  defaultRef: { credentialId: string; modelId: string } | null;
  onChanged: () => Promise<void>;
}) {
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (q && !m.modelId.toLowerCase().includes(q) && !m.displayName.toLowerCase().includes(q) && !m.providerLabel.toLowerCase().includes(q)) return false;
      switch (filter) {
        case "vision":
          return m.capabilities.vision === true;
        case "reasoning":
          return m.capabilities.reasoning === true;
        case "tools":
          return m.capabilities.toolCalling === true;
        case "fast":
          return Boolean(m.labels.fast);
        case "coding":
          return Boolean(m.labels.coding);
        default:
          return true;
      }
    });
  }, [models, query, filter]);

  if (models.length === 0) {
    return (
      <EmptyState
        icon={<Bot size={28} aria-hidden />}
        title="No models yet"
        description="Connect a provider above and run Discover models — the list fills in from the provider's live API."
      />
    );
  }

  const setDefault = async (m: ModelDTO) => {
    const isDefault = defaultRef?.credentialId === m.credentialId && defaultRef.modelId === m.modelId;
    try {
      await modelsApi.setDefault(isDefault ? null : { credentialId: m.credentialId, modelId: m.modelId });
      await onChanged();
      push(isDefault ? "Default model cleared." : `${m.displayName} is now your default model.`, "success");
    } catch {
      push("Could not set default.", "error");
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search models…" className="pl-9" aria-label="Search models" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter models">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                filter === f.id ? "border-accent bg-accent-subtle text-accent" : "border-surface-border text-ink-secondary hover:bg-surface-hover"
              }`}
            >
              {f.id === "fast" ? <Zap size={11} className="mr-1 inline" aria-hidden /> : null}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border px-4 py-8 text-center text-[13px] text-ink-secondary">
          No models match this filter.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((m) => {
            const isDefault = defaultRef?.credentialId === m.credentialId && defaultRef.modelId === m.modelId;
            return (
              <li key={m.id} className="flex items-start gap-3 rounded-xl border border-surface-border bg-surface-raised p-3.5 shadow-subtle">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-ink-primary" title={m.modelId}>
                      {m.displayName}
                    </span>
                    {m.labels.fast ? (
                      <Badge>
                        <Zap size={9} aria-hidden /> Fast
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-tertiary">
                    {m.providerLabel}
                    {m.contextWindow ? ` · ${Math.round(m.contextWindow / 1000)}k context` : ""}
                    {m.pricing?.promptPer1M != null ? ` · ~$${m.pricing.promptPer1M}/1M in` : ""}
                    {m.source === "manual" ? " · manual" : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge tone="success">Text</Badge>
                    {m.capabilities.streaming !== false ? <Badge tone="success">Streaming</Badge> : null}
                    {m.capabilities.vision === true ? (
                      <Badge tone="success">Vision</Badge>
                    ) : m.capabilities.vision === null ? (
                      <Badge tone="warning">Vision ?</Badge>
                    ) : null}
                    {m.capabilities.toolCalling === true ? (
                      <Badge tone="success">Tools</Badge>
                    ) : m.capabilities.toolCalling === null ? (
                      <Badge tone="warning">Tools ?</Badge>
                    ) : null}
                    {m.capabilities.reasoning === true ? <Badge tone="success">Reasoning</Badge> : null}
                    {m.labels.coding ? <Badge>Coding</Badge> : null}
                  </div>
                </div>
                <button
                  onClick={() => void setDefault(m)}
                  aria-label={isDefault ? `Unset ${m.displayName} as default` : `Set ${m.displayName} as default`}
                  aria-pressed={isDefault}
                  className={`rounded-lg p-1.5 transition-colors ${isDefault ? "text-warning" : "text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary"}`}
                >
                  <Star size={17} className={isDefault ? "fill-warning" : undefined} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

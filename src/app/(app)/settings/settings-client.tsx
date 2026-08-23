"use client";

import { useState } from "react";
import { Brain, Eye, Lock, MessageSquare, Moon, Palette, Settings as SettingsIcon, Shield, Sun, Monitor, Trash2, User } from "lucide-react";
import type { ModelDTO } from "@/lib/providers/manager";
import { authApi, conversationsApi } from "@/lib/api-client";
import { useApp } from "@/components/app-shell";
import { Button, Input, Label, Toggle, useToast } from "@/components/ui";

export function SettingsClient() {
  const { me, settings, updateSettings, models, defaultModelRef, refreshModels, refreshConversations } = useApp();
  const { push } = useToast();
  const [name, setName] = useState(me.user.name);
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const fallbackRef = settings.fallbackModelRef ? (JSON.parse(settings.fallbackModelRef) as { credentialId: string; modelId: string }) : null;
  const currentDefault = defaultModelRef;

  const setFallbackModel = async (model: ModelDTO | null) => {
    await updateSettings({ fallbackModelRef: model ? JSON.stringify({ credentialId: model.credentialId, modelId: model.modelId }) : null });
    push(model ? `Fallback model: ${model.displayName}.` : "Fallback model cleared.", "success");
  };

  const savePassword = async () => {
    if (newPassword.length < 8) {
      push("New password must be at least 8 characters.", "error");
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      push("Password updated.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not update password.", "error");
    } finally {
      setSavingPassword(false);
    }
  };

  const deleteAllChats = async () => {
    if (!window.confirm("Delete ALL conversations permanently? This cannot be undone.")) return;
    try {
      const list = await conversationsApi.list();
      await Promise.all(list.conversations.map((c) => conversationsApi.remove(c.id)));
      await refreshConversations();
      push("All conversations deleted.", "success");
    } catch {
      push("Could not delete conversations.", "error");
    }
  };

  const themes: { id: "light" | "dark" | "system"; label: string; icon: React.ReactNode }[] = [
    { id: "light", label: "Light", icon: <Sun size={15} aria-hidden /> },
    { id: "dark", label: "Dark", icon: <Moon size={15} aria-hidden /> },
    { id: "system", label: "System", icon: <Monitor size={15} aria-hidden /> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-surface-border px-4 sm:px-6">
        <SettingsIcon size={18} className="text-accent" aria-hidden />
        <h1 className="text-[15px] font-semibold text-ink-primary">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-6 sm:px-6">
          {/* general */}
          <section aria-labelledby="set-general">
            <h2 id="set-general" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <User size={14} aria-hidden /> General
            </h2>
            <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <Label htmlFor="set-name">Display name</Label>
              <div className="flex gap-2">
                <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
                <Button
                  loading={savingName}
                  onClick={async () => {
                    if (name.trim().length < 2) {
                      push("Name must be at least 2 characters.", "error");
                      return;
                    }
                    setSavingName(true);
                    try {
                      await authApi.updateName(name.trim());
                      push("Name saved.", "success");
                    } catch (err) {
                      push(err instanceof Error ? err.message : "Could not save name.", "error");
                    } finally {
                      setSavingName(false);
                    }
                  }}
                >
                  Save
                </Button>
              </div>
              <p className="mt-2 text-[12px] text-ink-tertiary">Signed in as {me.user.email}</p>
            </div>
          </section>

          {/* appearance */}
          <section aria-labelledby="set-appearance">
            <h2 id="set-appearance" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <Palette size={14} aria-hidden /> Appearance
            </h2>
            <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <Label>Theme</Label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    role="radio"
                    aria-checked={settings.theme === t.id}
                    onClick={() => void updateSettings({ theme: t.id })}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                      settings.theme === t.id ? "border-accent bg-accent-subtle text-accent" : "border-surface-border text-ink-secondary hover:bg-surface-hover"
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* AI models */}
          <section aria-labelledby="set-models">
            <h2 id="set-models" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <Brain size={14} aria-hidden /> AI Models
            </h2>
            <div className="space-y-3 rounded-2xl border border-surface-border bg-surface-raised p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13.5px] font-medium text-ink-primary">Auto model routing</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">
                    When no model is explicitly picked, Nexus chooses among your connected models per message (vision → vision model, complex → reasoning model, simple → fast model).
                  </p>
                </div>
                <Toggle checked={settings.autoRouting} onChange={(v) => void updateSettings({ autoRouting: v })} label="Auto model routing" />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-surface-border pt-3">
                <div>
                  <p className="text-[13.5px] font-medium text-ink-primary">Model fallback</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">
                    If the primary model fails before producing output, retry once and then continue with the fallback model. You&apos;ll always see a notice when this happens.
                  </p>
                </div>
                <Toggle checked={settings.fallbackEnabled} onChange={(v) => void updateSettings({ fallbackEnabled: v })} label="Model fallback" />
              </div>
              {settings.fallbackEnabled ? (
                <div className="border-t border-surface-border pt-3">
                  <Label htmlFor="set-fallback">Fallback model</Label>
                  <select
                    id="set-fallback"
                    value={fallbackRef ? `${fallbackRef.credentialId}:${fallbackRef.modelId}` : ""}
                    onChange={(e) => {
                      const key = e.target.value;
                      if (!key) {
                        void setFallbackModel(null);
                        return;
                      }
                      const [credentialId, ...rest] = key.split(":");
                      const model = models.find((m) => m.credentialId === credentialId && m.modelId === rest.join(":"));
                      void setFallbackModel(model ?? null);
                    }}
                    className="h-10 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-ink-primary focus:border-accent focus:outline-none"
                  >
                    <option value="">None</option>
                    {models.map((m) => (
                      <option key={m.id} value={`${m.credentialId}:${m.modelId}`}>
                        {m.displayName} ({m.providerLabel}){currentDefault?.modelId === m.modelId ? " — default" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="border-t border-surface-border pt-3">
                <Label>Default model</Label>
                <p className="text-[12px] text-ink-secondary">
                  {currentDefault
                    ? `Current default: ${models.find((m) => m.credentialId === currentDefault.credentialId && m.modelId === currentDefault.modelId)?.displayName ?? currentDefault.modelId}`
                    : "No default set — set one from the star icon on the AI Models page."}
                </p>
              </div>
            </div>
          </section>

          {/* chat */}
          <section aria-labelledby="set-chat">
            <h2 id="set-chat" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <MessageSquare size={14} aria-hidden /> Chat
            </h2>
            <div className="space-y-3 rounded-2xl border border-surface-border bg-surface-raised p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13.5px] font-medium text-ink-primary">Enter sends message</p>
                  <p className="mt-0.5 text-[12px] text-ink-secondary">Off: Enter adds a newline; use the send button.</p>
                </div>
                <Toggle checked={settings.sendOnEnter} onChange={(v) => void updateSettings({ sendOnEnter: v })} label="Enter sends message" />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-surface-border pt-3">
                <div>
                  <p className="text-[13.5px] font-medium text-ink-primary">Web search by default</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">
                    Grounds answers with live sources. {me.features.webSearchConfigured ? "" : "Note: no search API key is configured on this server — a best-effort DuckDuckGo fallback is used and may fail."}
                  </p>
                </div>
                <Toggle checked={settings.webSearchDefault} onChange={(v) => void updateSettings({ webSearchDefault: v })} label="Web search by default" />
              </div>
            </div>
          </section>

          {/* privacy */}
          <section aria-labelledby="set-privacy">
            <h2 id="set-privacy" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <Eye size={14} aria-hidden /> Privacy
            </h2>
            <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <p className="text-[13.5px] font-medium text-ink-primary">Your data</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">
                Chats, files and provider keys are stored in this server&apos;s database, scoped to your account. Keys are AES-256-GCM encrypted. Shared chats are readable by anyone with the link until revoked (share again to revoke).
              </p>
              <Button variant="danger" size="sm" className="mt-3" onClick={() => void deleteAllChats()}>
                <Trash2 size={14} aria-hidden /> Delete all conversations
              </Button>
            </div>
          </section>

          {/* security */}
          <section aria-labelledby="set-security">
            <h2 id="set-security" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <Shield size={14} aria-hidden /> Security
            </h2>
            <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <div className="flex items-start gap-2.5">
                <Lock size={15} className="mt-0.5 shrink-0 text-ink-tertiary" aria-hidden />
                <div className="w-full">
                  <p className="text-[13.5px] font-medium text-ink-primary">Change password</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="set-pass-current">Current password</Label>
                      <Input id="set-pass-current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
                    </div>
                    <div>
                      <Label htmlFor="set-pass-new">New password</Label>
                      <Input id="set-pass-new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                    </div>
                  </div>
                  <Button size="sm" className="mt-3" onClick={() => void savePassword()} loading={savingPassword}>
                    Update password
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

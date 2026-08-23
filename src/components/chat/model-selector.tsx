"use client";

import { useMemo, useState } from "react";
import { Bot, Check, ChevronDown, Sparkles, Star, Zap } from "lucide-react";
import type { ModelDTO } from "@/lib/providers/manager";
import { Badge, Dropdown } from "@/components/ui";
import { useApp } from "@/components/app-shell";

export type ModelSelection = { kind: "auto" } | { kind: "model"; model: ModelDTO };

export function capabilityBadges(model: ModelDTO) {
  const caps = model.capabilities;
  const badges: { label: string; tone: "success" | "neutral" | "warning" }[] = [];
  badges.push({ label: "Text", tone: "success" });
  if (caps.streaming !== false) badges.push({ label: "Streaming", tone: "success" });
  if (caps.vision === true) badges.push({ label: "Vision", tone: "success" });
  else if (caps.vision === null) badges.push({ label: "Vision ?", tone: "warning" });
  if (caps.toolCalling === true) badges.push({ label: "Tools", tone: "success" });
  else if (caps.toolCalling === null) badges.push({ label: "Tools ?", tone: "warning" });
  if (caps.reasoning === true) badges.push({ label: "Reasoning", tone: "success" });
  if (model.labels.fast) badges.push({ label: "Fast", tone: "neutral" });
  if (model.labels.coding) badges.push({ label: "Coding", tone: "neutral" });
  return badges.slice(0, 6);
}

export function ModelSelector({
  selection,
  onSelect,
  compact,
}: {
  selection: ModelSelection;
  onSelect: (sel: ModelSelection) => void;
  compact?: boolean;
}) {
  const { models, defaultModelRef } = useApp();
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; models: ModelDTO[] }>();
    for (const m of models) {
      const key = m.providerLabel;
      if (!map.has(key)) map.set(key, { label: key, models: [] });
      map.get(key)!.models.push(m);
    }
    return [...map.values()];
  }, [models]);

  const current = selection.kind === "model" ? selection.model : null;
  const label = current ? current.displayName : "Auto";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${label}. Change model`}
        className="flex h-9 max-w-[220px] items-center gap-1.5 rounded-lg border border-surface-border bg-surface px-3 text-[13px] font-medium text-ink-primary transition-colors hover:bg-surface-hover sm:max-w-[260px]"
      >
        {selection.kind === "auto" ? <Sparkles size={14} className="shrink-0 text-accent" aria-hidden /> : <Bot size={14} className="shrink-0 text-accent" aria-hidden />}
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className="shrink-0 text-ink-tertiary" aria-hidden />
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)} align="left" className="top-full w-80 max-w-[calc(100vw-2rem)]">
        <div className="max-h-[60vh] overflow-y-auto">
          {models.length > 1 ? (
            <button
              className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover ${selection.kind === "auto" ? "bg-accent-subtle/50" : ""}`}
              onClick={() => {
                onSelect({ kind: "auto" });
                setOpen(false);
              }}
            >
              <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-primary">
                  Auto
                  {selection.kind === "auto" ? <Check size={13} className="text-accent" aria-hidden /> : null}
                </span>
                <span className="block text-[11.5px] leading-relaxed text-ink-secondary">
                  Picks the best connected model per message (vision, reasoning, speed).
                </span>
              </span>
            </button>
          ) : null}
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">{group.label}</div>
              {group.models.map((m) => {
                const selected = current?.credentialId === m.credentialId && current?.modelId === m.modelId;
                const isDefault = defaultModelRef?.credentialId === m.credentialId && defaultModelRef?.modelId === m.modelId;
                return (
                  <button
                    key={`${m.credentialId}:${m.modelId}`}
                    className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-hover ${selected ? "bg-accent-subtle/50" : ""}`}
                    onClick={() => {
                      onSelect({ kind: "model", model: m });
                      setOpen(false);
                    }}
                  >
                    <Bot size={15} className="mt-0.5 shrink-0 text-ink-tertiary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-primary">
                        <span className="truncate">{m.displayName}</span>
                        {isDefault ? <Star size={11} className="shrink-0 fill-warning text-warning" aria-label="Default model" /> : null}
                        {selected ? <Check size={13} className="shrink-0 text-accent" aria-hidden /> : null}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {capabilityBadges(m).map((b) => (
                          <Badge key={b.label} tone={b.tone === "success" ? "success" : b.tone === "warning" ? "warning" : "neutral"}>
                            {b.label === "Fast" ? (
                              <>
                                <Zap size={9} aria-hidden /> Fast
                              </>
                            ) : (
                              b.label
                            )}
                          </Badge>
                        ))}
                        {m.contextWindow ? <Badge>{Math.round(m.contextWindow / 1000)}k ctx</Badge> : null}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {models.length === 0 ? (
            <p className="px-3 py-4 text-[12.5px] text-ink-secondary">No models yet — connect a provider in AI Models.</p>
          ) : null}
        </div>
      </Dropdown>
    </div>
  );
}

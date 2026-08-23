"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, Columns3, Square, Zap } from "lucide-react";
import type { ModelDTO } from "@/lib/providers/manager";
import { streamCompare, type CompareStreamEvent } from "@/lib/api-client";
import { Badge, Button, Input, Modal, useToast } from "@/components/ui";
import { useApp } from "@/components/app-shell";
import { Markdown } from "@/components/markdown";

type CompareCard = {
  ref: string;
  model: string;
  provider: string;
  text: string;
  ms?: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  error?: string;
  done: boolean;
};

export function CompareModal({ open, onClose, initialQuestion }: { open: boolean; onClose: () => void; initialQuestion?: string }) {
  const { models } = useApp();
  const { push } = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [cards, setCards] = useState<Record<string, CompareCard>>({});
  const [running, setRunning] = useState(false);
  const [abort, setAbort] = useState<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setCards({});
      setPicked((prev) => prev.filter((key) => models.some((m) => `${m.credentialId}:${m.modelId}` === key)));
    }
  }, [open, models]);

  const eligible = useMemo(() => models.filter((m) => m.enabled).slice(0, 24), [models]);
  const toggle = (key: string) => {
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= 3 ? prev : [...prev, key]));
  };

  const run = async () => {
    if (question.trim().length === 0 || picked.length < 2 || running) return;
    setRunning(true);
    setCards(Object.fromEntries(picked.map((key) => [key, { ref: key, model: key, provider: "", text: "", done: false }])));
    const controller = new AbortController();
    setAbort(controller);
    try {
      await streamCompare(
        {
          message: question.trim(),
          refs: picked.map((key) => {
            const [credentialId, ...rest] = key.split(":");
            return { credentialId, modelId: rest.join(":") };
          }),
        },
        (evt: CompareStreamEvent) => {
          setCards((prev) => {
            const next = { ...prev };
            if (evt.type === "start") {
              next[evt.ref] = { ...(next[evt.ref] ?? { ref: evt.ref, text: "", done: false }), model: evt.model, provider: evt.provider, done: false };
            } else if (evt.type === "delta") {
              const card = next[evt.ref] ?? { ref: evt.ref, model: evt.ref, provider: "", text: "", done: false };
              next[evt.ref] = { ...card, text: card.text + evt.text };
            } else if (evt.type === "done") {
              const card = next[evt.ref] ?? { ref: evt.ref, model: evt.ref, provider: "", text: "", done: false };
              next[evt.ref] = { ...card, done: true, ms: evt.ms, usage: evt.usage };
            } else if (evt.type === "error") {
              const card = next[evt.ref] ?? { ref: evt.ref, model: evt.ref, provider: "", text: "", done: false };
              next[evt.ref] = { ...card, done: true, error: evt.message };
            }
            return next;
          });
        },
        controller.signal
      );
    } catch { /* aborted */ }
    finally {
      setRunning(false);
      setAbort(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        abort?.abort();
        onClose();
      }}
      title="Compare models"
      description="Ask up to 3 connected models the same question and compare answers side by side. Responses are not saved."
      wide
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="compare-q" className="mb-1.5 block text-[13px] font-medium text-ink-secondary">
            Question
          </label>
          <Input id="compare-q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Explain the difference between TCP and UDP" />
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-secondary">
            Models <span className="font-normal text-ink-tertiary">({picked.length}/3 selected)</span>
          </p>
          {eligible.length < 2 ? (
            <p className="rounded-lg border border-dashed border-surface-border px-3 py-4 text-center text-[13px] text-ink-secondary">
              Connect at least two models to compare.
            </p>
          ) : (
            <div className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {eligible.map((m) => {
                const key = `${m.credentialId}:${m.modelId}`;
                const on = picked.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    aria-pressed={on}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition-colors ${
                      on ? "border-accent bg-accent-subtle" : "border-surface-border hover:bg-surface-hover"
                    }`}
                  >
                    <span className={`h-4 w-4 shrink-0 rounded border ${on ? "border-accent bg-accent" : "border-surface-border"}`} aria-hidden>
                      {on ? (
                        <svg viewBox="0 0 16 16" className="h-full w-full text-accent-fg" fill="none" aria-hidden>
                          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink-primary">{m.displayName}</span>
                      <span className="block truncate text-[11px] text-ink-tertiary">{m.providerLabel}</span>
                    </span>
                    {m.labels.fast ? (
                      <Badge>
                        <Zap size={9} aria-hidden /> Fast
                      </Badge>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {running ? (
            <Button variant="secondary" onClick={() => abort?.abort()}>
              <Square size={14} className="fill-current" aria-hidden /> Stop
            </Button>
          ) : (
            <Button onClick={run} disabled={picked.length < 2 || !question.trim()}>
              <Columns3 size={15} aria-hidden /> Run comparison
            </Button>
          )}
        </div>

        {Object.keys(cards).length > 0 ? (
          <div className={`grid gap-3 ${Object.keys(cards).length > 1 ? "md:grid-cols-2" : ""} ${Object.keys(cards).length > 2 ? "xl:grid-cols-3" : ""}`}>
            {Object.values(cards).map((card) => (
              <div key={card.ref} className="flex min-w-0 flex-col rounded-xl border border-surface-border bg-surface-raised">
                <div className="flex items-center gap-2 border-b border-surface-border px-3 py-2">
                  <Brain size={13} className="shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-primary">{card.model}</span>
                  {card.ms ? <span className="shrink-0 text-[11px] text-ink-tertiary">{(card.ms / 1000).toFixed(1)}s</span> : null}
                  {card.usage?.outputTokens ? <span className="shrink-0 text-[11px] text-ink-tertiary">{card.usage.outputTokens} tok</span> : null}
                </div>
                <div className="max-h-72 overflow-y-auto px-3 py-2.5">
                  {card.error ? (
                    <p className="text-[13px] text-danger">{card.error}</p>
                  ) : card.text ? (
                    <Markdown text={card.text} />
                  ) : card.done ? (
                    <p className="text-[13px] italic text-ink-tertiary">No output.</p>
                  ) : (
                    <p className="flex items-center gap-2 text-[13px] text-ink-tertiary">
                      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" aria-hidden /> waiting…
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

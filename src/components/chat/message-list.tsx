"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Calculator,
  Link2,
  MessageSquareWarning,
  MoreHorizontal,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  User,
  LinkIcon,
} from "lucide-react";
import type { MessageMeta } from "@/lib/conversations";
import type { ModelDTO } from "@/lib/providers/manager";
import { Markdown } from "@/components/markdown";
import { Badge, Button, Dropdown, MenuItem } from "@/components/ui";
import type { UIMessage } from "./chat-view";

export function MessageList({
  messages,
  models,
  busy,
  onRegenerate,
  onFeedback,
  onRegenerateWith,
  onReport,
  onRetry,
  onShare,
}: {
  messages: UIMessage[];
  models: ModelDTO[];
  busy: boolean;
  onRegenerate: () => void;
  onFeedback: (id: string, value: 1 | -1 | 0) => void;
  onRegenerateWith: (model: ModelDTO) => void;
  onReport: (id: string) => void;
  onRetry: () => void;
  onShare: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !pinned) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pinned]);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 180);
  };

  return (
    <div className="relative flex-1 overflow-y-auto" onScroll={onScroll} ref={containerRef} role="log" aria-live="polite">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {messages.map((m) =>
          m.role === "user" ? (
            <UserMessage key={m.id} message={m} />
          ) : (
            <AssistantMessage
              key={m.id}
              message={m}
              models={models}
              busy={busy}
              isLastAssistant={lastAssistant?.id === m.id}
              onRegenerate={onRegenerate}
              onFeedback={onFeedback}
              onRegenerateWith={onRegenerateWith}
              onReport={onReport}
              onRetry={onRetry}
              onShare={onShare}
            />
          )
        )}
      </div>
      {!pinned ? (
        <button
          onClick={() => {
            setPinned(true);
            const el = containerRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          aria-label="Scroll to latest message"
          className="sticky bottom-4 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-surface-border bg-surface-overlay text-ink-secondary shadow-card"
        >
          <ChevronDown size={17} />
        </button>
      ) : null}
    </div>
  );
}

/* ─── user message ───────────────────────────────────────────────────────── */

function UserMessage({ message }: { message: UIMessage }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group mb-6 flex justify-end">
      <div className="max-w-[85%] min-w-0">
        <div className="rounded-2xl rounded-tr-md bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-accent-fg shadow-subtle">
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        </div>
        {message.meta.attachments?.length ? (
          <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
            {message.meta.attachments.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-raised px-2 py-1 text-[11.5px] text-ink-secondary">
                {a.kind === "image" ? <FileText size={12} aria-hidden /> : <FileText size={12} aria-hidden />}
                {a.filename}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-1 flex justify-end opacity-0 transition-opacity group-hover:opacity-100">
          <button
            aria-label="Copy message"
            className="rounded-md p-1.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch { /* ignore */ }
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── assistant message ──────────────────────────────────────────────────── */

const TOOL_ICONS: Record<string, React.ReactNode> = {
  web_search: <Globe size={12} aria-hidden />,
  fetch_url: <Link2 size={12} aria-hidden />,
  calculator: <Calculator size={12} aria-hidden />,
  file_search: <FileText size={12} aria-hidden />,
  run_javascript: <Code2 size={12} aria-hidden />,
};

function AssistantMessage({
  message,
  models,
  busy,
  isLastAssistant,
  onRegenerate,
  onFeedback,
  onRegenerateWith,
  onReport,
  onRetry,
  onShare,
}: {
  message: UIMessage;
  models: ModelDTO[];
  busy: boolean;
  isLastAssistant: boolean;
  onRegenerate: () => void;
  onFeedback: (id: string, value: 1 | -1 | 0) => void;
  onRegenerateWith: (model: ModelDTO) => void;
  onReport: (id: string) => void;
  onRetry: () => void;
  onShare: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const meta = message.meta;
  const feedback = meta.feedback;

  return (
    <div className="group mb-7 min-w-0">
      <div className="mb-1.5 flex items-center gap-2 text-[12px] text-ink-tertiary">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-subtle text-accent">
          <User size={0} aria-hidden />
          <Brain size={11} aria-hidden />
        </span>
        <span className="font-medium text-ink-secondary">{meta.model ?? message.modelId ?? "Assistant"}</span>
        {meta.provider ? <span className="hidden sm:inline">· {meta.provider}</span> : null}
        {meta.usage?.outputTokens ? <span>· {meta.usage.outputTokens} tok</span> : null}
        {meta.latencyMs ? <span>· {(meta.latencyMs / 1000).toFixed(1)}s</span> : null}
        {message.streaming ? (
          <span className="flex items-center gap-1 text-accent">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" aria-hidden /> generating
          </span>
        ) : null}
      </div>

      {message.reasoning ? (
        <div className="mb-2">
          <button
            onClick={() => setShowReasoning((v) => !v)}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] font-medium text-ink-tertiary hover:bg-surface-hover hover:text-ink-secondary"
            aria-expanded={showReasoning}
          >
            <Brain size={12} aria-hidden /> {showReasoning ? "Hide" : "Show"} reasoning
            <ChevronDown size={12} className={`transition-transform ${showReasoning ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {showReasoning ? (
            <div className="mt-1 whitespace-pre-wrap rounded-xl border border-surface-border bg-surface-raised px-3.5 py-3 text-[13px] leading-relaxed text-ink-secondary">
              {message.reasoning}
            </div>
          ) : null}
        </div>
      ) : null}

      {meta.notices?.length ? (
        <div className="mb-2 space-y-1.5">
          {meta.notices.map((n, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[12.5px] leading-relaxed text-ink-secondary">
              <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              <span>{n}</span>
            </div>
          ))}
        </div>
      ) : null}

      {meta.toolCalls?.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {meta.toolCalls.map((t, i) => (
            <span
              key={i}
              title={t.summary}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] font-medium ${
                t.ok === false
                  ? "border-danger/30 bg-danger/5 text-danger"
                  : t.ok === true
                    ? "border-success/25 bg-success/5 text-success"
                    : "border-surface-border bg-surface-raised text-ink-secondary"
              }`}
            >
              {TOOL_ICONS[t.name] ?? <Code2 size={12} aria-hidden />}
              {t.name}
              {t.ok == null ? <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" aria-hidden /> : null}
            </span>
          ))}
        </div>
      ) : null}

      {message.content ? (
        <Markdown text={message.content} />
      ) : message.streaming ? (
        <div className="flex items-center gap-2 py-1 text-[13px] text-ink-tertiary">
          <span className="flex gap-1" aria-hidden>
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ink-tertiary" />
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ink-tertiary [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ink-tertiary [animation-delay:300ms]" />
          </span>
          thinking…
        </div>
      ) : message.meta.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 text-[13.5px] text-danger">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">The response failed</p>
            <p className="mt-0.5 leading-relaxed text-ink-secondary">{message.meta.error}</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={onRetry}>
              <RefreshCw size={13} aria-hidden /> Retry
            </Button>
          </div>
        </div>
      ) : null}

      {message.meta.aborted && message.content ? (
        <p className="mt-2 text-[12px] italic text-ink-tertiary">Generation stopped — partial response saved.</p>
      ) : null}

      {meta.sources?.length ? <Sources sources={meta.sources} /> : null}

      {!message.streaming && (message.content || message.meta.error) ? (
        <div className="mt-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <IconAction label="Copy response" onClick={copyHandler(message.content, setCopied)} active={copied}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </IconAction>
          {isLastAssistant ? (
            <IconAction label="Regenerate response" onClick={onRegenerate} disabled={busy}>
              <RefreshCw size={15} />
            </IconAction>
          ) : null}
          <IconAction
            label={feedback === 1 ? "Remove like" : "Like response"}
            onClick={() => onFeedback(message.id, feedback === 1 ? 0 : 1)}
            active={feedback === 1}
          >
            <ThumbsUp size={15} className={feedback === 1 ? "fill-success/20" : undefined} />
          </IconAction>
          <IconAction
            label={feedback === -1 ? "Remove dislike" : "Dislike response"}
            onClick={() => onFeedback(message.id, feedback === -1 ? 0 : -1)}
            active={feedback === -1}
          >
            <ThumbsDown size={15} className={feedback === -1 ? "fill-danger/20" : undefined} />
          </IconAction>
          <IconAction label="Share conversation" onClick={onShare}>
            <LinkIcon size={15} />
          </IconAction>
          <div className="relative">
            <IconAction label="More actions" onClick={() => setMenuOpen((v) => !v)}>
              <MoreHorizontal size={15} />
            </IconAction>
            <Dropdown open={menuOpen} onClose={() => setMenuOpen(false)} className="w-56">
              <MenuItem
                icon={<RefreshCw size={14} />}
                onClick={() => {
                  setMenuOpen(false);
                  onRetry();
                }}
              >
                Retry
              </MenuItem>
              {models.length > 1 ? (
                <>
                  <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Regenerate with…</div>
                  <div className="max-h-52 overflow-y-auto">
                    {models.slice(0, 12).map((m) => (
                      <MenuItem
                        key={`${m.credentialId}:${m.modelId}`}
                        icon={<Brain size={14} />}
                        onClick={() => {
                          setMenuOpen(false);
                          onRegenerateWith(m);
                        }}
                      >
                        {m.displayName}
                      </MenuItem>
                    ))}
                  </div>
                </>
              ) : null}
              <MenuItem
                icon={<Copy size={14} />}
                onClick={async () => {
                  setMenuOpen(false);
                  await copyHandler(message.content, setCopied)();
                }}
              >
                Copy as Markdown
              </MenuItem>
              <MenuItem
                icon={<MessageSquareWarning size={14} />}
                onClick={() => {
                  setMenuOpen(false);
                  onReport(message.id);
                }}
              >
                Report response
              </MenuItem>
            </Dropdown>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function copyHandler(text: string, setCopied: (v: boolean) => void) {
  return async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
}

function IconAction({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-40 ${
        active ? "text-accent" : "text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary"
      }`}
    >
      {children}
    </button>
  );
}

/* ─── sources ────────────────────────────────────────────────────────────── */

function Sources({ sources }: { sources: NonNullable<MessageMeta["sources"]> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-xl border border-surface-border bg-surface-raised">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-medium text-ink-secondary hover:text-ink-primary"
      >
        <Globe size={13} className="text-accent" aria-hidden />
        Sources ({sources.length})
        <ChevronDown size={14} className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <ul className="border-t border-surface-border px-3.5 py-2">
          {sources.map((s, i) => {
            let host = s.url;
            try {
              host = new URL(s.url).hostname;
            } catch { /* keep url */ }
            return (
              <li key={`${s.url}-${i}`} className="border-b border-surface-border py-2 last:border-0">
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="group flex items-start gap-2 text-[12.5px]">
                  <Badge tone="accent" className="mt-0.5 shrink-0">{i + 1}</Badge>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink-primary group-hover:text-accent">{s.title}</span>
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-ink-tertiary">
                      <ExternalLink size={10} aria-hidden /> {host}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

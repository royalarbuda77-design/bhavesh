"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Archive,
  Columns3,
  Lightbulb,
  Menu,
  MoreHorizontal,
  Pencil,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { MessageMeta } from "@/lib/conversations";
import type { ModelDTO } from "@/lib/providers/manager";
import { conversationsApi, streamChat } from "@/lib/api-client";
import { useApp } from "@/components/app-shell";
import { Button, Dropdown, MenuItem, Modal, Input, useToast } from "@/components/ui";
import { Composer, type PendingAttachment } from "./composer";
import { MessageList } from "./message-list";
import { ModelSelector, type ModelSelection } from "./model-selector";
import { CompareModal } from "./compare-modal";

export type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning: string | null;
  modelId: string | null;
  meta: MessageMeta;
  createdAt: number;
  streaming?: boolean;
};

const SUGGESTIONS = [
  "Explain how transformers work, simply.",
  "Write a Python script to rename files by date.",
  "What are the trade-offs of SQL vs NoSQL?",
  "Search the web: latest news on reusable rockets.",
];

export function ChatView() {
  const params = useParams<{ id?: string }>();
  const conversationId = params?.id ?? null;
  const router = useRouter();
  const { models, settings, refreshConversations, setSidebarOpen, conversations } = useApp();
  const { push } = useToast();

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<ModelSelection>({ kind: "auto" });
  const [webSearch, setWebSearch] = useState(settings.webSearchDefault);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const conversation = useMemo(() => conversations.find((c) => c.id === conversationId) ?? null, [conversations, conversationId]);

  /* default selection from settings */
  useEffect(() => {
    if (settings.defaultModelRef && models.length > 0) {
      try {
        const ref = JSON.parse(settings.defaultModelRef) as { credentialId: string; modelId: string };
        const model = models.find((m) => m.credentialId === ref.credentialId && m.modelId === ref.modelId);
        if (model) setSelection({ kind: "model", model });
        else if (models.length === 1) setSelection({ kind: "model", model: models[0] });
      } catch { /* keep auto */ }
    } else if (models.length === 1) {
      setSelection({ kind: "model", model: models[0] });
    }
  }, [settings.defaultModelRef, models]);

  useEffect(() => setWebSearch(settings.webSearchDefault), [settings.webSearchDefault]);

  /* load conversation */
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    conversationsApi
      .get(conversationId)
      .then((data) => {
        if (cancelled) return;
        setMessages(
          data.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            reasoning: m.reasoning,
            modelId: m.modelId,
            meta: m.meta,
            createdAt: m.createdAt,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) {
          push("Conversation not found or not yours.", "error");
          router.replace("/chat");
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [conversationId, push, router]);

  /* ─── streaming ────────────────────────────────────────────────────────── */

  const runStream = useCallback(
    async (body: Parameters<typeof streamChat>[0], tempUserId: string | null, tempAssistantId: string) => {
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let assistantIdx = messages.length + (tempUserId ? 2 : 1) - 1;

      const patchAssistant = (fn: (m: UIMessage) => UIMessage) => {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === tempAssistantId);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = fn(next[idx]);
          return next;
        });
      };

      try {
        await streamChat(
          body,
          (evt) => {
            switch (evt.type) {
              case "start":
                if (!conversationId) {
                  window.history.replaceState(null, "", `/chat/${evt.conversationId}`);
                  void refreshConversations();
                }
                if (tempUserId) {
                  setMessages((prev) => prev.map((m) => (m.id === tempUserId ? { ...m, id: evt.userMessageId ?? m.id } : m)));
                }
                break;
              case "meta":
                patchAssistant((m) => ({
                  ...m,
                  modelId: evt.model.modelId,
                  meta: { ...m.meta, model: evt.model.displayName, provider: evt.model.providerLabel },
                }));
                break;
              case "text":
                patchAssistant((m) => ({ ...m, content: m.content + evt.delta }));
                break;
              case "reasoning":
                patchAssistant((m) => ({ ...m, reasoning: (m.reasoning ?? "") + evt.delta }));
                break;
              case "tool_call":
                patchAssistant((m) => ({
                  ...m,
                  meta: { ...m.meta, toolCalls: [...(m.meta.toolCalls ?? []), { name: evt.name, ok: null, summary: "running…" }] },
                }));
                break;
              case "tool_result":
                patchAssistant((m) => {
                  const calls = [...(m.meta.toolCalls ?? [])];
                  for (let i = calls.length - 1; i >= 0; i--) {
                    if (calls[i].name === evt.name && calls[i].ok === null) {
                      calls[i] = { name: evt.name, ok: evt.ok, summary: evt.summary };
                      break;
                    }
                  }
                  return { ...m, meta: { ...m.meta, toolCalls: calls } };
                });
                break;
              case "sources":
                patchAssistant((m) => {
                  const merged = [...(m.meta.sources ?? [])];
                  for (const s of evt.sources) if (!merged.some((x) => x.url === s.url)) merged.push(s);
                  return { ...m, meta: { ...m.meta, sources: merged } };
                });
                break;
              case "usage":
                patchAssistant((m) => ({ ...m, meta: { ...m.meta, usage: { ...m.meta.usage, ...evt } } }));
                break;
              case "notice":
                patchAssistant((m) => ({
                  ...m,
                  meta: { ...m.meta, notices: [...(m.meta.notices ?? []), evt.message] },
                }));
                push(evt.message, "info");
                break;
              case "done":
                patchAssistant((m) => ({
                  ...m,
                  id: evt.messageId,
                  streaming: false,
                  meta: { ...m.meta, latencyMs: evt.latencyMs },
                }));
                void refreshConversations();
                break;
              case "error":
                patchAssistant((m) => ({
                  ...m,
                  streaming: false,
                  meta: { ...m.meta, error: evt.message },
                }));
                if (controller.signal.aborted === false) push(evt.message, "error");
                break;
            }
          },
          controller.signal
        );
      } catch (err) {
        const aborted = controller.signal.aborted;
        patchAssistant((m) => ({
          ...m,
          streaming: false,
          meta: aborted ? { ...m.meta, aborted: true } : { ...m.meta, error: err instanceof Error ? err.message : "Connection lost." },
        }));
        if (!aborted) push("Stream interrupted. Please retry.", "error");
      } finally {
        setBusy(false);
        abortRef.current = null;
        void refreshConversations();
      }
      return assistantIdx;
    },
    [conversationId, messages.length, push, refreshConversations]
  );

  const send = useCallback(
    async (text: string) => {
      if (busy) return;
      const now = Date.now();
      const tempUserId = `tmp-u-${now}`;
      const tempAssistantId = `tmp-a-${now}`;
      const attachmentIds = attachments.map((a) => a.id);
      const attachmentMeta = attachments.map((a) => ({ id: a.id, filename: a.filename, kind: a.kind }));
      setMessages((prev) => [
        ...prev,
        {
          id: tempUserId,
          role: "user",
          content: text,
          reasoning: null,
          modelId: null,
          meta: attachmentMeta.length ? { attachments: attachmentMeta } : {},
          createdAt: now,
        },
        { id: tempAssistantId, role: "assistant", content: "", reasoning: null, modelId: null, meta: {}, createdAt: now + 1, streaming: true },
      ]);
      setAttachments([]);
      await runStream(
        {
          conversationId: conversationId ?? undefined,
          message: text,
          attachmentIds,
          webSearch,
          modelRef: selection.kind === "model" ? { credentialId: selection.model.credentialId, modelId: selection.model.modelId } : null,
          autoRoute: selection.kind === "auto" || undefined,
        },
        tempUserId,
        tempAssistantId
      );
    },
    [abortRef, attachments, busy, conversationId, runStream, selection, webSearch]
  );

  const regenerate = useCallback(
    async (modelOverride?: ModelDTO) => {
      if (busy || !conversationId) return;
      setMessages((prev) => {
        const next = [...prev];
        while (next.length > 0 && next[next.length - 1].role === "assistant") next.pop();
        if (next.length === 0) return prev;
        return next;
      });
      const tempAssistantId = `tmp-a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: tempAssistantId, role: "assistant", content: "", reasoning: null, modelId: null, meta: {}, createdAt: Date.now() + 1, streaming: true },
      ]);
      await runStream(
        {
          conversationId,
          regenerate: true,
          webSearch,
          modelRef: modelOverride
            ? { credentialId: modelOverride.credentialId, modelId: modelOverride.modelId }
            : selection.kind === "model"
              ? { credentialId: selection.model.credentialId, modelId: selection.model.modelId }
              : null,
          autoRoute: !modelOverride && selection.kind === "auto" ? true : undefined,
        },
        null,
        tempAssistantId
      );
    },
    [busy, conversationId, runStream, selection, webSearch]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const feedback = useCallback(
    async (id: string, value: 1 | -1 | 0) => {
      if (id.startsWith("tmp-")) return;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, meta: { ...m.meta, feedback: value } } : m)));
      try {
        await conversationsApi.feedback(id, value);
      } catch { /* keep optimistic */ }
    },
    []
  );

  const share = useCallback(async () => {
    if (!conversationId) {
      push("Send a message first — you can share once the chat has content.", "info");
      return;
    }
    try {
      const data = await conversationsApi.share(conversationId);
      await navigator.clipboard.writeText(data.url).catch(() => undefined);
      push("Share link copied to clipboard.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not create share link.", "error");
    }
  }, [conversationId, push]);

  const deleteChat = useCallback(async () => {
    if (!conversationId) return;
    try {
      await conversationsApi.remove(conversationId);
      push("Conversation deleted.", "success");
      router.push("/chat");
      void refreshConversations();
    } catch {
      push("Could not delete conversation.", "error");
    }
  }, [conversationId, push, refreshConversations, router]);

  const noModels = models.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-surface-border bg-surface px-3 sm:px-5">
        <button
          className="rounded-lg p-2 text-ink-secondary hover:bg-surface-hover md:hidden"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <Menu size={19} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink-primary">
          {conversation?.title ?? "New chat"}
        </h1>
        <ModelSelector selection={selection} onSelect={setSelection} />
        <button
          onClick={() => setCompareOpen(true)}
          disabled={models.length < 2}
          aria-label="Compare models"
          title={models.length < 2 ? "Connect 2+ models to compare" : "Compare models"}
          className="hidden rounded-lg p-2 text-ink-tertiary transition-colors hover:bg-surface-hover hover:text-ink-primary disabled:opacity-40 sm:block"
        >
          <Columns3 size={18} />
        </button>
        <button
          onClick={share}
          aria-label="Share conversation"
          title="Share conversation"
          className="rounded-lg p-2 text-ink-tertiary transition-colors hover:bg-surface-hover hover:text-ink-primary"
        >
          <Share2 size={18} />
        </button>
        {conversationId ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Conversation options"
              aria-expanded={menuOpen}
              className="rounded-lg p-2 text-ink-tertiary transition-colors hover:bg-surface-hover hover:text-ink-primary"
            >
              <MoreHorizontal size={18} />
            </button>
            <Dropdown open={menuOpen} onClose={() => setMenuOpen(false)}>
              <MenuItem
                icon={<Pencil size={14} />}
                onClick={() => {
                  setMenuOpen(false);
                  setRenameValue(conversation?.title ?? "");
                  setRenameOpen(true);
                }}
              >
                Rename
              </MenuItem>
              <MenuItem
                icon={<Archive size={14} />}
                onClick={async () => {
                  setMenuOpen(false);
                  try {
                    await conversationsApi.update(conversationId, { archived: true });
                    push("Conversation archived.", "success");
                    router.push("/chat");
                    void refreshConversations();
                  } catch {
                    push("Could not archive conversation.", "error");
                  }
                }}
              >
                Archive
              </MenuItem>
              <MenuItem icon={<Trash2 size={14} />} danger onClick={() => { setMenuOpen(false); void deleteChat(); }}>
                Delete
              </MenuItem>
            </Dropdown>
          </div>
        ) : null}
      </header>

      {/* body */}
      {loading ? (
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
          <div className="skeleton h-6 w-2/3" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-16 w-5/6" />
        </div>
      ) : noModels && messages.length === 0 ? (
        <NoModelsState />
      ) : messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
            <Sparkles size={26} aria-hidden />
          </div>
          <h2 className="text-center text-xl font-semibold text-ink-primary sm:text-2xl">How can I help you today?</h2>
          <p className="mt-1.5 max-w-md text-center text-[13.5px] leading-relaxed text-ink-secondary">
            {selection.kind === "auto"
              ? "Auto mode picks the best connected model for each message."
              : `Chatting with ${selection.model.displayName}.`}
            {webSearch ? " Web search is on." : ""}
          </p>
          <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                className="flex items-start gap-2.5 rounded-xl border border-surface-border bg-surface-raised px-3.5 py-3 text-left text-[13px] leading-snug text-ink-secondary transition-colors hover:border-accent/40 hover:bg-accent-subtle/40 hover:text-ink-primary"
              >
                <Lightbulb size={15} className="mt-0.5 shrink-0 text-ink-tertiary" aria-hidden />
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <MessageList
          messages={messages}
          models={models}
          busy={busy}
          onRegenerate={() => void regenerate()}
          onFeedback={feedback}
          onRegenerateWith={(m) => void regenerate(m)}
          onReport={(id) => {
            void feedback(id, -1);
            push("Thanks — this response was reported.", "success");
          }}
          onRetry={() => void regenerate()}
          onShare={share}
        />
      )}

      <Composer
        conversationId={conversationId}
        selection={selection}
        busy={busy}
        webSearch={webSearch}
        onToggleWebSearch={() => setWebSearch((v) => !v)}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        onSend={(t) => void send(t)}
        onStop={stop}
      />

      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} />

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename chat"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!conversationId) return;
                try {
                  await conversationsApi.update(conversationId, { title: renameValue.trim() || "Untitled" });
                  setRenameOpen(false);
                  void refreshConversations();
                  push("Chat renamed.", "success");
                } catch {
                  push("Rename failed.", "error");
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus aria-label="Chat title" />
      </Modal>
    </div>
  );
}

function NoModelsState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
        <Sparkles size={26} aria-hidden />
      </div>
      <h2 className="text-xl font-semibold text-ink-primary">Connect an AI provider to start chatting</h2>
      <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-secondary">
        Nexus AI lets you bring your own keys — OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Mistral, xAI or any
        OpenAI-compatible endpoint. Keys are encrypted at rest and never sent back to the browser.
      </p>
      <a href="/models" className="mt-5">
        <Button size="lg">
          <Sparkles size={16} aria-hidden /> Connect a provider
        </Button>
      </a>
    </div>
  );
}

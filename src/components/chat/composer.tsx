"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Globe, ImagePlus, Mic, MicOff, Paperclip, Square, TriangleAlert, X } from "lucide-react";
import { filesApi } from "@/lib/api-client";
import { Button, useToast } from "@/components/ui";
import { useApp } from "@/components/app-shell";
import { useSpeechInput } from "@/hooks/use-speech";
import type { ModelSelection } from "./model-selector";

export type PendingAttachment = { id: string; filename: string; kind: string; previewUrl?: string };

export function Composer({
  conversationId,
  selection,
  busy,
  webSearch,
  onToggleWebSearch,
  attachments,
  onAttachmentsChange,
  onSend,
  onStop,
  placeholder,
}: {
  conversationId: string | null;
  selection: ModelSelection;
  busy: boolean;
  webSearch: boolean;
  onToggleWebSearch: () => void;
  attachments: PendingAttachment[];
  onAttachmentsChange: (next: PendingAttachment[]) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const { settings, me } = useApp();
  const { push } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseValueRef = useRef("");

  const speech = useSpeechInput((text, isFinal) => {
    if (isFinal) {
      baseValueRef.current = `${baseValueRef.current ? baseValueRef.current + " " : ""}${text.trim()}`;
      setValue(baseValueRef.current);
    } else {
      setValue(`${baseValueRef.current ? baseValueRef.current + " " : ""}${text}`);
    }
    resize();
  });

  const visionCapable =
    selection.kind === "auto" ||
    (selection.kind === "model" && selection.model.capabilities.vision === true);
  const hasImage = attachments.some((a) => a.kind === "image");
  const blockedByVision = hasImage && !visionCapable;

  useEffect(() => {
    baseValueRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  const submit = () => {
    const text = value.trim();
    if (!text || busy || blockedByVision) return;
    onSend(text);
    setValue("");
    baseValueRef.current = "";
    requestAnimationFrame(resize);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files).slice(0, 4)) {
      try {
        const data = await filesApi.upload(file, conversationId);
        onAttachmentsChange([
          ...attachments,
          {
            id: data.file.id,
            filename: data.file.filename,
            kind: data.file.kind,
            previewUrl: data.file.kind === "image" ? URL.createObjectURL(file) : undefined,
          },
        ]);
      } catch (err) {
        push(err instanceof Error ? `${file.name}: ${err.message}` : `Could not upload ${file.name}.`, "error");
      }
    }
  };

  return (
    <div className="border-t border-surface-border bg-surface px-3 pb-3 pt-3 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,.csv,.json,.docx,.png,.jpg,.jpeg,.gif,.webp"
          className="hidden"
          aria-hidden
          onChange={(e) => {
            if (e.target.files?.length) void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {attachments.length ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="group relative flex items-center gap-2 rounded-xl border border-surface-border bg-surface-raised py-1.5 pl-2 pr-8 text-[12px] text-ink-secondary"
              >
                {a.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.previewUrl} alt="" className="h-7 w-7 rounded-md object-cover" />
                ) : (
                  <FileText size={14} className="text-ink-tertiary" aria-hidden />
                )}
                <span className="max-w-40 truncate">{a.filename}</span>
                <button
                  aria-label={`Remove attachment ${a.filename}`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary"
                  onClick={() => onAttachmentsChange(attachments.filter((x) => x.id !== a.id))}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {blockedByVision ? (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[12px] text-ink-secondary">
            <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            The selected model does not support image input. Remove images, pick a vision-capable model, or use Auto.
          </div>
        ) : null}

        <div className="flex items-end gap-2 rounded-2xl border border-surface-border bg-surface-raised p-2 shadow-subtle transition-colors focus-within:border-accent/50">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files (PDF, TXT, DOCX, images)"
              title="Attach files"
              className="rounded-lg p-2 text-ink-tertiary transition-colors hover:bg-surface-hover hover:text-ink-primary"
            >
              <Paperclip size={18} />
            </button>
            {visionCapable ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Upload image for analysis"
                title="Upload image"
                className="hidden rounded-lg p-2 text-ink-tertiary transition-colors hover:bg-surface-hover hover:text-ink-primary sm:block"
              >
                <ImagePlus size={18} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (!speech.supported) {
                  push("Voice input is not supported by this browser. Try Chrome or Edge.", "error");
                  return;
                }
                speech.toggle();
              }}
              aria-label={speech.listening ? "Stop voice input" : "Start voice input"}
              aria-pressed={speech.listening}
              title={speech.supported ? "Voice input" : "Voice input not supported in this browser"}
              className={`rounded-lg p-2 transition-colors ${
                speech.listening ? "bg-danger/10 text-danger" : "text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary"
              }`}
            >
              {speech.listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              type="button"
              onClick={onToggleWebSearch}
              aria-pressed={webSearch}
              aria-label="Toggle web search"
              title={`Web search ${webSearch ? "on" : "off"}${me.features.webSearchConfigured ? "" : " (uses best-effort fallback — no search API configured)"}`}
              className={`rounded-lg p-2 transition-colors ${
                webSearch ? "bg-accent-subtle text-accent" : "text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary"
              }`}
            >
              <Globe size={18} />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              resize();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && settings.sendOnEnter && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder ?? "Message Nexus AI…  (Enter to send, Shift+Enter for a new line)"}
            aria-label="Chat message"
            className="max-h-[220px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-relaxed text-ink-primary placeholder:text-ink-tertiary focus:outline-none"
          />

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-primary text-surface transition-opacity hover:opacity-80"
            >
              <Square size={15} className="fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim() || blockedByVision}
              aria-label="Send message"
              title="Send"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-fg transition-all hover:bg-accent-hover disabled:opacity-40"
            >
              <ArrowUp size={17} />
            </button>
          )}
        </div>

        <p className="mt-2 hidden text-center text-[11px] text-ink-tertiary sm:block">
          Nexus AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

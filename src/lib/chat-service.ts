import { config } from "./env";
import { log } from "./logger";
import { getSettings, type SessionUser } from "./auth";
import {
  adapterFor,
  listModels,
  getModel,
  resolveCredential,
  type ModelDTO,
} from "./providers/manager";
import type { StreamEvent, WireMessage, ImageAttachment } from "./providers/types";
import { executeTool, toolsForTurn } from "./tools";
import { webSearch, type SearchResult } from "./search";
import { routeModel } from "./agent";
import {
  appendMessage,
  createConversation,
  deleteTrailingAssistantMessages,
  getConversation,
  listMessages,
  setMessageFeedback,
  type MessageMeta,
} from "./conversations";
import { getFileRow } from "./files";

/**
 * ChatService — orchestrates a full chat turn end-to-end:
 * history → model resolution (explicit / default / auto-route) → capability
 * gating → optional pre-search → agent tool loop → streaming to the client →
 * persistence. Never sends provider keys anywhere but the provider.
 */

export type ModelRef = { credentialId: string; modelId: string };

export type ChatRequestBody = {
  conversationId?: string;
  message?: string;
  attachmentIds?: string[];
  webSearch?: boolean;
  modelRef?: ModelRef | null;
  autoRoute?: boolean;
  regenerate?: boolean;
  codeExecution?: boolean;
};

export type ServerEvent =
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

const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY_MESSAGES = 24;
const MAX_FILE_CONTEXT_CHARS = 15_000;

function systemPrompt(): string {
  return [
    "You are Nexus AI, a helpful, accurate and honest assistant running inside the Nexus AI platform.",
    `Current date: ${new Date().toISOString().slice(0, 10)}.`,
    "If web search results are included in the context, ground your answer in them and cite sources inline as [1], [2] … matching the numbered result list.",
    "If a tool call fails, tell the user clearly what failed — never fabricate tool output, citations or facts.",
    "Be concise by default; expand when the question warrants depth. Use Markdown for structure.",
  ].join(" ");
}

export function deriveTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New chat";
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}…` : cleaned;
}

type TurnContext = {
  wire: WireMessage[];
  images: ImageAttachment[];
  attachmentMeta: MessageMeta["attachments"];
};

/** Build wire messages from stored history + the current turn's attachments. */
async function buildTurn(
  userId: string,
  conversationId: string,
  currentUserMessageId: string | null,
  userText: string,
  attachmentIds: string[]
): Promise<TurnContext> {
  const history = listMessages(userId, conversationId);
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  const attachments = attachmentIds
    .map((id) => getFileRow(userId, id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const images: ImageAttachment[] = [];
  const docBlocks: string[] = [];
  const attachmentMeta: MessageMeta["attachments"] = [];
  for (const f of attachments) {
    const kind = String(f.kind);
    attachmentMeta.push({ id: String(f.id), filename: String(f.filename), kind });
    if (kind === "image" && f.data_b64) {
      images.push({ mime: String(f.mime), dataB64: String(f.data_b64) });
    } else if (f.text_content) {
      const content = String(f.text_content).slice(0, MAX_FILE_CONTEXT_CHARS);
      docBlocks.push(`--- Attached file: ${f.filename} ---\n${content}\n--- end of file ---`);
    }
  }

  const wire: WireMessage[] = [];
  for (const m of recent) {
    const isCurrent = currentUserMessageId && m.id === currentUserMessageId;
    if (m.role === "user") {
      if (isCurrent) continue; // appended below with attachments
      wire.push({ role: "user", content: m.content });
    } else {
      wire.push({ role: "assistant", content: m.content || "(no content)" });
    }
  }
  const currentContent = docBlocks.length
    ? `${userText}\n\nThe following files are attached to this message:\n\n${docBlocks.join("\n\n")}`
    : userText;
  wire.push({ role: "user", content: currentContent, images: images.length ? images : undefined });
  return { wire, images, attachmentMeta };
}

/* ─── model resolution ──────────────────────────────────────────────────── */

type Resolution =
  | { ok: true; model: ModelDTO; notice?: string; reason?: string }
  | { ok: false; error: string; code: string };

function resolveModel(
  models: ModelDTO[],
  body: ChatRequestBody,
  stored: { credentialId: string | null; modelId: string | null },
  defaultRef: ModelRef | null,
  autoRouteSetting: boolean,
  userText: string,
  hasImages: boolean,
  webSearch: boolean
): Resolution {
  const enabled = models.filter((m) => m.enabled);

  if (body.modelRef) {
    const found = enabled.find((m) => m.credentialId === body.modelRef!.credentialId && m.modelId === body.modelRef!.modelId);
    if (!found) return { ok: false, error: "The selected model is no longer available. Re-select a model.", code: "model_unavailable" };
    if (hasImages && found.capabilities.vision !== true) {
      // respect capabilities: refuse rather than degrade silently
      return {
        ok: false,
        error: `The selected model (${found.displayName}) does not support image input. Pick a vision-capable model or use Auto.`,
        code: "capability_mismatch",
      };
    }
    return { ok: true, model: found };
  }

  if (body.autoRoute || autoRouteSetting) {
    const routed = routeModel(enabled, userText, hasImages, webSearch);
    if (routed) {
      return { ok: true, model: routed.model, reason: routed.decision.reason, notice: routed.decision.reason };
    }
    if (hasImages) {
      return { ok: false, error: "No connected model supports image input. Connect a vision-capable model (e.g. gpt-4o, claude-3, gemini).", code: "capability_mismatch" };
    }
  }

  if (stored.credentialId && stored.modelId) {
    const found = enabled.find((m) => m.credentialId === stored.credentialId && m.modelId === stored.modelId);
    if (found && (!hasImages || found.capabilities.vision === true)) return { ok: true, model: found };
    if (found && hasImages && found.capabilities.vision !== true) {
      return { ok: false, error: `This conversation's model (${found.displayName}) does not support image input. Select a vision-capable model.`, code: "capability_mismatch" };
    }
  }

  if (defaultRef) {
    const found = enabled.find((m) => m.credentialId === defaultRef.credentialId && m.modelId === defaultRef.modelId);
    if (found && (!hasImages || found.capabilities.vision === true)) return { ok: true, model: found };
  }

  const vision = enabled.filter((m) => m.capabilities.vision === true);
  if (hasImages) {
    if (vision.length === 0) return { ok: false, error: "No connected model supports image input.", code: "capability_mismatch" };
    return { ok: true, model: vision[0], notice: "Routed to a vision-capable model." };
  }
  if (enabled.length === 1) return { ok: true, model: enabled[0] };
  return { ok: false, error: "No model selected. Choose a model in the header, or enable Auto in settings.", code: "no_model_selected" };
}

/* ─── chat turn execution ───────────────────────────────────────────────── */

type Emitter = (event: ServerEvent) => void;

export async function executeChatTurn(
  user: SessionUser,
  body: ChatRequestBody,
  reqId: string,
  emit: Emitter,
  externalSignal: AbortSignal
): Promise<void> {
  const started = Date.now();
  const settings = getSettings(user.id);
  const models = listModels(user.id);

  /* 1. conversation */
  let conversation = body.conversationId ? getConversation(user.id, body.conversationId) : null;
  if (body.conversationId && !conversation) throw new Error("Conversation not found.");
  let userMessageId: string | null = null;
  let userText = (body.message ?? "").trim();

  if (body.regenerate && conversation) {
    deleteTrailingAssistantMessages(user.id, conversation.id);
    const msgs = listMessages(user.id, conversation.id);
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) throw new Error("Nothing to regenerate — send a message first.");
    userText = lastUser.content;
    userMessageId = lastUser.id;
  } else {
    if (!userText) throw new Error("Message is empty.");
    if (!conversation) conversation = createConversation(user.id, deriveTitle(userText));
    const turnAttachments = (body.attachmentIds ?? []).map((id) => getFileRow(user.id, id)).filter(Boolean);
    const msg = appendMessage(user.id, conversation.id, {
      role: "user",
      content: userText,
      meta: {
        attachments: turnAttachments.map((f) => ({ id: String(f!.id), filename: String(f!.filename), kind: String(f!.kind) })),
      },
    });
    userMessageId = msg.id;
    conversation = getConversation(user.id, conversation.id)!;
  }

  emit({ type: "start", conversationId: conversation.id, title: conversation.title, userMessageId });

  /* 2. build context */
  const turn = await buildTurn(user.id, conversation.id, userMessageId, userText, body.attachmentIds ?? []);
  const webSearchOn = body.webSearch ?? settings.webSearchDefault;

  /* 3. resolve model */
  const defaultRef = settings.defaultModelRef ? (JSON.parse(settings.defaultModelRef) as ModelRef) : null;
  const resolution = resolveModel(models, body, conversation, defaultRef, settings.autoRouting, userText, turn.images.length > 0, webSearchOn);
  if (!resolution.ok) {
    emit({ type: "error", message: resolution.error, code: resolution.code });
    return;
  }
  let targetModel = resolution.model;
  const notices: string[] = [];
  if (resolution.notice) {
    notices.push(resolution.notice);
    emit({ type: "notice", message: resolution.notice });
  }
  emit({
    type: "meta",
    model: {
      modelId: targetModel.modelId,
      displayName: targetModel.displayName,
      providerId: targetModel.providerId,
      providerLabel: targetModel.providerLabel,
    },
    reason: resolution.reason,
  });

  /* 4. optional pre-search (works even for models without tool calling) */
  const sources: SearchResult[] = [];
  const wire: WireMessage[] = [{ role: "system", content: systemPrompt() }, ...turn.wire];
  if (webSearchOn) {
    const outcome = await webSearch(userText, 5);
    if (outcome.ok) {
      sources.push(...outcome.results);
      wire[0].content += `\n\nWeb search results for "${userText}" (cite as [n]):\n${outcome.results
        .map((r, i) => `[${i + 1}] ${r.title} — ${r.url}\n${r.snippet}`)
        .join("\n\n")}`;
      emit({ type: "sources", sources: outcome.results });
    } else {
      const notice = `Web search failed: ${outcome.error}`;
      notices.push(notice);
      emit({ type: "notice", message: notice });
    }
  }

  /* 5. tools */
  const toolSet = toolsForTurn(
    { userId: user.id, conversationId: conversation.id },
    { webSearch: webSearchOn, codeExecution: body.codeExecution ?? true }
  );
  const useTools = targetModel.capabilities.toolCalling === true && toolSet.length > 0;
  if (webSearchOn && targetModel.capabilities.toolCalling !== true) {
    const notice = "This model does not declare tool-calling support — search results were added directly to the context instead.";
    notices.push(notice);
    emit({ type: "notice", message: notice });
  }

  /* 6. agent loop with fallback */
  const creds = resolveCredential(user.id, targetModel.credentialId);
  if (!creds) {
    emit({ type: "error", message: "Provider credentials are no longer available. Reconnect the provider.", code: "credential_missing" });
    return;
  }

  let text = "";
  let reasoning = "";
  let usage: MessageMeta["usage"] = {};
  const toolCallLog: NonNullable<MessageMeta["toolCalls"]> = [];
  const roundWire = [...wire];

  const runModel = async (model: ModelDTO): Promise<{ failedBeforeOutput: boolean; errorMessage?: string; errorCode?: string }> => {
    const modelCreds = model.credentialId === creds!.credentialId ? creds! : resolveCredential(user.id, model.credentialId);
    if (!modelCreds) return { failedBeforeOutput: true, errorMessage: "Provider credentials missing.", errorCode: "credential_missing" };
    let producedOutput = false;
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const remainingRounds = MAX_TOOL_ROUNDS - round;
      const tools = useTools && remainingRounds > 0 ? toolSet.map((t) => t.spec) : undefined;
      if (useTools && remainingRounds === 0) {
        roundWire.push({ role: "system", content: "Tool budget exhausted for this turn — answer with what you have and say so if you still need a tool." });
      }
      let toolCallsThisRound: { id: string; name: string; args: Record<string, unknown> }[] | null = null;
      try {
        for await (const evt of adapterFor(modelCreds.providerId).streamChat(
          modelCreds,
          { model: model.modelId, messages: roundWire, tools, maxTokens: 4096, temperature: 0.7 },
          externalSignal
        )) {
          if (evt.type === "text") { producedOutput = true; text += evt.delta; emit({ type: "text", delta: evt.delta }); }
          else if (evt.type === "reasoning") { producedOutput = true; reasoning += evt.delta; emit({ type: "reasoning", delta: evt.delta }); }
          else if (evt.type === "tool_calls") { producedOutput = true; toolCallsThisRound = evt.calls; }
          else if (evt.type === "usage") {
            usage = { ...usage, ...clean(evt) };
            emit({ type: "usage", inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
          }
          else if (evt.type === "error") { throw Object.assign(new Error(evt.message), { code: evt.code, retryable: evt.retryable }); }
        }
      } catch (err) {
        const e = err as Error & { code?: string; retryable?: boolean };
        if (externalSignal.aborted) return { failedBeforeOutput: false };
        if (producedOutput) {
          emit({ type: "error", message: `The model stream failed mid-response: ${e.message}`, code: e.code ?? "stream_error" });
          return { failedBeforeOutput: false, errorMessage: e.message, errorCode: e.code };
        }
        return { failedBeforeOutput: true, errorMessage: e.message, errorCode: e.code };
      }

      if (!toolCallsThisRound || toolCallsThisRound.length === 0) break;

      roundWire.push({ role: "assistant", content: "", toolCalls: toolCallsThisRound });
      for (const call of toolCallsThisRound) {
        emit({ type: "tool_call", name: call.name, args: call.args });
        const result = await executeTool(call.name, call.args, { userId: user.id, conversationId: conversation!.id });
        emit({ type: "tool_result", name: call.name, ok: result.ok, summary: result.summary });
        toolCallLog.push({ name: call.name, ok: result.ok, summary: result.summary });
        if (result.sources) {
          for (const s of result.sources) if (!sources.some((x) => x.url === s.url)) sources.push(s);
          emit({ type: "sources", sources: result.sources });
        }
        roundWire.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify(result.output).slice(0, 12_000),
        });
      }
    }
    return { failedBeforeOutput: false };
  };

  let outcome = await runModel(targetModel);

  /* fallback chain: retry same model once for transient errors, then fallback model */
  if (outcome.failedBeforeOutput && !externalSignal.aborted) {
    const fallbackRef = settings.fallbackEnabled && settings.fallbackModelRef ? (JSON.parse(settings.fallbackModelRef) as ModelRef) : null;
    const fallbackModel = fallbackRef ? models.find((m) => m.enabled && m.credentialId === fallbackRef.credentialId && m.modelId === fallbackRef.modelId) : undefined;
    if (fallbackModel && fallbackModel.modelId !== targetModel.modelId) {
      const notice = `Primary model unavailable (${outcome.errorMessage ?? "request failed"}). Response generated using your fallback model (${fallbackModel.displayName}).`;
      notices.push(notice);
      emit({ type: "notice", message: notice });
      text = ""; reasoning = ""; usage = {};
      targetModel = fallbackModel;
      emit({ type: "meta", model: { modelId: fallbackModel.modelId, displayName: fallbackModel.displayName, providerId: fallbackModel.providerId, providerLabel: fallbackModel.providerLabel }, notice: "fallback" });
      outcome = await runModel(fallbackModel);
    } else if (outcome.errorMessage) {
      emit({ type: "error", message: outcome.errorMessage, code: outcome.errorCode ?? "provider_error" });
    }
  }

  /* 7. persist assistant message */
  const latencyMs = Date.now() - started;
  const meta: MessageMeta = {
    sources: sources.length ? sources : undefined,
    toolCalls: toolCallLog.length ? toolCallLog : undefined,
    usage: Object.keys(usage).length ? usage : undefined,
    notices: notices.length ? notices : undefined,
    aborted: externalSignal.aborted || undefined,
    error: outcome.errorMessage,
    model: targetModel.modelId,
    provider: targetModel.providerLabel,
    latencyMs,
  };
  const assistantMessage = appendMessage(user.id, conversation.id, {
    role: "assistant",
    content: text,
    reasoning: reasoning || null,
    modelId: targetModel.modelId,
    credentialId: targetModel.credentialId,
    meta,
  });
  log.info({
    reqId,
    userId: user.id,
    provider: targetModel.providerId,
    model: targetModel.modelId,
    latencyMs,
    toolCalls: toolCallLog.length,
  }, "chat turn complete");
  emit({ type: "done", messageId: assistantMessage.id, latencyMs });
}

function clean(evt: { inputTokens?: number; outputTokens?: number }): { inputTokens?: number; outputTokens?: number } {
  const out: { inputTokens?: number; outputTokens?: number } = {};
  if (evt.inputTokens != null) out.inputTokens = evt.inputTokens;
  if (evt.outputTokens != null) out.outputTokens = (out.outputTokens ?? 0) + evt.outputTokens;
  return out;
}

/* ─── SSE response helpers ──────────────────────────────────────────────── */

export function sseResponse(
  run: (emit: (event: ServerEvent) => void, signal: AbortSignal) => Promise<void>,
  reqSignal: AbortSignal
): Response {
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: ServerEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const onAbort = () => abortController.abort();
      reqSignal.addEventListener("abort", onAbort, { once: true });
      try {
        await run(emit, abortController.signal);
      } catch (err) {
        const e = err as Error;
        if (!reqSignal.aborted) emit({ type: "error", message: e.message || "Chat failed unexpectedly.", code: "internal_error" });
        log.error({ err: `${e.name}: ${e.message}` }, "chat turn error");
      } finally {
        reqSignal.removeEventListener("abort", onAbort);
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      abortController.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function sseCompareResponse(
  run: (emit: (event: CompareEvent) => void, signal: AbortSignal) => Promise<void>,
  reqSignal: AbortSignal
): Response {
  // reuse the same machinery with a JSON-typed emitter
  return sseResponse(run as unknown as (emit: (event: ServerEvent) => void, signal: AbortSignal) => Promise<void>, reqSignal);
}

/* ─── compare models (parallel, non-persisted) ──────────────────────────── */

export type CompareEvent =
  | { type: "start"; ref: string; model: string; provider: string }
  | { type: "delta"; ref: string; text: string }
  | { type: "done"; ref: string; ms: number; usage?: { inputTokens?: number; outputTokens?: number } }
  | { type: "error"; ref: string; message: string };

export async function executeCompare(
  user: SessionUser,
  message: string,
  refs: ModelRef[],
  emit: (event: CompareEvent) => void,
  externalSignal: AbortSignal
): Promise<void> {
  const models = listModels(user.id).filter((m) => m.enabled);
  await Promise.all(
    refs.slice(0, 3).map(async (ref) => {
      const key = `${ref.credentialId}:${ref.modelId}`;
      const model = models.find((m) => m.credentialId === ref.credentialId && m.modelId === ref.modelId);
      if (!model) {
        emit({ type: "error", ref: key, message: "Model not available." });
        return;
      }
      const creds = resolveCredential(user.id, model.credentialId);
      if (!creds) {
        emit({ type: "error", ref: key, message: "Provider credentials missing." });
        return;
      }
      const started = Date.now();
      emit({ type: "start", ref: key, model: model.displayName, provider: model.providerLabel });
      let usage: { inputTokens?: number; outputTokens?: number } | undefined;
      let text = "";
      try {
        for await (const evt of adapterFor(creds.providerId).streamChat(
          creds,
          { model: model.modelId, messages: [{ role: "system", content: systemPrompt() }, { role: "user", content: message }], maxTokens: 2048 },
          externalSignal
        )) {
          if (evt.type === "text") { text += evt.delta; emit({ type: "delta", ref: key, text: evt.delta }); }
          else if (evt.type === "usage") usage = { ...usage, ...evt };
          else if (evt.type === "error") throw new Error(evt.message);
        }
        emit({ type: "done", ref: key, ms: Date.now() - started, usage });
      } catch (err) {
        if (text) emit({ type: "done", ref: key, ms: Date.now() - started, usage });
        else emit({ type: "error", ref: key, message: (err as Error).message });
      }
    })
  );
}

export { setMessageFeedback };

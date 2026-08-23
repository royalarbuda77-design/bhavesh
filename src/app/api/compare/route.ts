import { withAuth, readJson, ApiError } from "@/lib/api";
import { executeCompare, sseCompareResponse, type ModelRef } from "@/lib/chat-service";

/**
 * POST /api/compare — ask up to 3 models the same question, streamed in
 * parallel (SSE events tagged with model refs). Responses are ephemeral.
 */
export const POST = withAuth(
  async ({ user, req }) => {
    const body = await readJson<{ message?: string; refs?: ModelRef[] }>(req);
    const message = (body.message ?? "").trim();
    const refs = (body.refs ?? []).filter((r) => r && r.credentialId && r.modelId).slice(0, 3);
    if (!message) throw new ApiError(400, "empty_message", "Message cannot be empty.");
    if (refs.length < 2) throw new ApiError(400, "need_models", "Select at least two models to compare.");
    return sseCompareResponse((emit, signal) => executeCompare(user, message, refs, emit, signal), req.signal);
  },
  { rateLimit: "chat" }
);

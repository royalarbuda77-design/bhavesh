import { withAuth, readJson, ApiError } from "@/lib/api";
import { executeChatTurn, sseResponse, type ChatRequestBody } from "@/lib/chat-service";

/**
 * POST /api/chat — streaming chat endpoint (SSE).
 * Body: { conversationId?, message, attachmentIds?, webSearch?, modelRef?, autoRoute?, regenerate? }
 */
export const POST = withAuth(
  async ({ user, reqId, req }) => {
    const body = await readJson<ChatRequestBody>(req);
    if (!body.regenerate && !(body.message ?? "").trim()) {
      throw new ApiError(400, "empty_message", "Message cannot be empty.");
    }
    return sseResponse((emit, signal) => executeChatTurn(user, body, reqId, emit, signal), req.signal);
  },
  { rateLimit: "chat" }
);

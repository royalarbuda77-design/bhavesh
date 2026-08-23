/** Isomorphic SSE line parser shared by provider adapters (server) and the
 * browser chat client (parses our own /api/chat stream). */

export type SSEEvent = { event: string | null; data: string };

export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
  decoder: TextDecoder = new TextDecoder()
): AsyncGenerator<SSEEvent> {
  const reader = body.getReader();
  let buffer = "";
  let pendingEvent: string | null = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("event:")) {
          pendingEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          yield { event: pendingEvent, data: line.slice(5).trim() };
          pendingEvent = null;
        } else if (line === "") {
          pendingEvent = null;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

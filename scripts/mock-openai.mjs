/**
 * A real OpenAI-compatible mock provider used by the E2E suite to exercise the
 * full pipeline (connect → test → discover → chat → tools → fallback →
 * compare) without paid API keys. Implements /v1/models and
 * /v1/chat/completions (streaming SSE + tool calls) per the OpenAI spec.
 */
import http from "node:http";

const VALID_KEYS = new Set(["test-key", "test-key-2"]);
// canonical model names so the capability knowledge base classifies them
// exactly like a real OpenAI-compatible endpoint would advertise
const MODELS = [{ id: "gpt-4o" }, { id: "o3-mini" }, { id: "llama-3.1-8b-instant" }, { id: "mock-fail" }];

function sse(res, chunks) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

export function startMockProvider(port = 8787) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const auth = req.headers.authorization || "";
      const key = auth.replace(/^Bearer\s+/i, "");
      const keyOk = VALID_KEYS.has(key);
      const json = (status, obj) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };

      if (url.pathname === "/v1/models") {
        if (!keyOk) return json(401, { error: { message: "Incorrect API key provided." } });
        return json(200, { object: "list", data: MODELS });
      }

      if (url.pathname === "/v1/chat/completions") {
        if (!keyOk) return json(401, { error: { message: "Incorrect API key provided." } });
        let parsed = {};
        try {
          parsed = JSON.parse(body);
        } catch {
          return json(400, { error: { message: "invalid json" } });
        }
        const model = parsed.model || "";
        const messages = parsed.messages || [];
        if (model === "mock-fail") return json(503, { error: { message: "Model overloaded, try again later." } });

        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const userText = lastUser && typeof lastUser.content === "string" ? lastUser.content : "";
        const hasToolResult = messages.some((m) => m.role === "tool");
        const askedCalc = /calc|2\+2|math/i.test(userText);
        const wantsSlow = /slow/i.test(userText);

        if (model === "mock-fail-stream") {
          return sse(res, [{ error: { message: "boom" } }]);
        }

        // tool-calling round: model asks for the calculator before answering
        if (parsed.tools?.length && askedCalc && !hasToolResult) {
          return sse(res, [
            {
              id: "chatcmpl-tool1",
              object: "chat.completion.chunk",
              choices: [{ index: 0, delta: { role: "assistant", content: null, tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "calculator", arguments: "" } }] } }],
            },
            {
              id: "chatcmpl-tool1",
              object: "chat.completion.chunk",
              choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"expression":"2+2"}' } }] } }],
            },
            { id: "chatcmpl-tool1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
            { id: "chatcmpl-tool1", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 20, completion_tokens: 5 } },
          ]);
        }

        const answer = hasToolResult
          ? "The calculator says 2+2 = 4."
          : wantsSlow
            ? "This is a slow streaming answer for stop testing."
            : `Hello! How can I help you today? (model: ${model})`;
        const words = answer.split(" ");

        const chunks = [];
        chunks.push({ id: "chatcmpl-x", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "" } }] });
        for (const w of words) chunks.push({ id: "chatcmpl-x", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: w + " " } }] });
        chunks.push({ id: "chatcmpl-x", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
        chunks.push({ id: "chatcmpl-x", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 11, completion_tokens: words.length } });

        if (wantsSlow) {
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
          let i = 0;
          const timer = setInterval(() => {
            if (i < chunks.length) {
              res.write(`data: ${JSON.stringify(chunks[i++])}\n\n`);
            } else {
              clearInterval(timer);
              res.write("data: [DONE]\n\n");
              res.end();
            }
          }, 120);
          // note: req 'close' fires when the request body ends — watch the
          // response/connection instead so client disconnects stop the timer
          res.on("close", () => clearInterval(timer));
          return;
        }
        return sse(res, chunks);
      }

      json(404, { error: { message: `Unknown route ${url.pathname}` } });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

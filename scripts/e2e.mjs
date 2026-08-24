/**
 * End-to-end test suite. Runs against a live Nexus AI server (BASE, default
 * http://localhost:3000) with a local mock OpenAI-compatible provider — real
 * HTTP, real SSE streaming, real database, real credential encryption.
 *
 * Usage: node scripts/e2e.mjs [BASE]
 */
import assert from "node:assert";
import { startMockProvider } from "./mock-openai.mjs";

const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:3000";
const MOCK_PORT = 8787;

/* ─── helpers ────────────────────────────────────────────────────────────── */

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

function client() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async call(path, { method = "GET", body, headers = {}, raw = false, signal } = {}) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          ...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        signal,
        redirect: "manual",
      });
      const setCookie = res.headers.getSetCookie?.() ?? [];
      for (const c of setCookie) {
        const pair = c.split(";")[0];
        if (pair.startsWith("nexus_session=")) cookie = pair.endsWith("=") ? "" : pair;
      }
      if (raw) return res;
      let data = null;
      try {
        data = await res.json();
      } catch { /* no body */ }
      return { status: res.status, data };
    },
  };
}

async function readSSE(res, onEvent, { abortAfterMs, signal } = {}) {
  const controller = new AbortController();
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
  let timer = null;
  if (abortAfterMs) timer = setTimeout(() => controller.abort(), abortAfterMs);
  const events = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of frame.split("\n")) {
          if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload);
              events.push(evt);
              onEvent?.(evt);
            } catch { /* ignore */ }
          }
        }
      }
      if (controller.signal.aborted) {
        reader.cancel().catch(() => {});
        break;
      }
    }
  } catch (err) {
    if (!controller.signal.aborted) throw err;
  } finally {
    if (signal) signal.removeEventListener("abort", () => controller.abort());
    if (timer) clearTimeout(timer);
  }
  return events;
}

/** Build a byte-valid single-page PDF whose xref offsets are computed correctly. */
function makePdf(text) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null, // content stream, filled below
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

  let body = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /ID [<e2e4e2e4e2e4e2e4e2e4e2e4e2e4> <e2e4e2e4e2e4e2e4e2e4e2e4e2e4>] >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, "latin1");
}

async function chat(c, body, opts = {}) {
  const res = await c.call("/api/chat", { method: "POST", body, raw: true, signal: opts.signal });
  if (res.status !== 200) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`chat failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return readSSE(res, null, opts);
}

/* ─── suite ──────────────────────────────────────────────────────────────── */

const mock = await startMockProvider(MOCK_PORT);
console.log(`E2E against ${BASE} (mock provider on 127.0.0.1:${MOCK_PORT})\n`);

const emailA = `userA-${Date.now()}@test.dev`;
const emailB = `userB-${Date.now()}@test.dev`;
const A = client();
const B = client();
const anon = client();
let conversationId = null;
let sharedUrl = null;
let fileTxtId = null;
let filePngId = null;
let providerIdA = null;

await test("health endpoint responds", async () => {
  const { status, data } = await anon.call("/api/health");
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, true);
});

/* ─── authentication ─────────────────────────────────────────────────────── */

await test("signup validates input (short password rejected)", async () => {
  const { status, data } = await anon.call("/api/auth/signup", { method: "POST", body: { name: "A", email: "x@x.com", password: "123" } });
  assert.strictEqual(status, 400);
  assert.ok(data.error);
});

await test("user A can sign up and receives a session cookie", async () => {
  const { status, data } = await A.call("/api/auth/signup", { method: "POST", body: { name: "Alice", email: emailA, password: "password123" } });
  assert.strictEqual(status, 201, JSON.stringify(data));
  assert.strictEqual(data.user.email, emailA.toLowerCase());
  assert.ok(A.cookie.includes("nexus_session="));
});

await test("duplicate signup is rejected", async () => {
  const { status } = await anon.call("/api/auth/signup", { method: "POST", body: { name: "Alice", email: emailA, password: "password123" } });
  assert.strictEqual(status, 409);
});

await test("user B can sign up", async () => {
  const { status } = await B.call("/api/auth/signup", { method: "POST", body: { name: "Bob", email: emailB, password: "password456" } });
  assert.strictEqual(status, 201);
});

await test("login rejects a wrong password", async () => {
  const { status, data } = await anon.call("/api/auth/login", { method: "POST", body: { email: emailA, password: "wrong-password" } });
  assert.strictEqual(status, 401);
  assert.ok(data.error.includes("Invalid"));
});

await test("login succeeds with correct credentials", async () => {
  const fresh = client();
  const { status } = await fresh.call("/api/auth/login", { method: "POST", body: { email: emailA, password: "password123" } });
  assert.strictEqual(status, 200);
});

await test("protected routes reject unauthenticated access", async () => {
  for (const path of ["/api/auth/me", "/api/conversations", "/api/providers", "/api/files", "/api/settings", "/api/models"]) {
    const res = await anon.call(path, { raw: true });
    assert.strictEqual(res.status, 401, `${path} should be 401`);
  }
  const chatRes = await anon.call("/api/chat", { method: "POST", body: { message: "hi" }, raw: true });
  assert.strictEqual(chatRes.status, 401);
  const pages = await Promise.all(["/chat", "/models", "/settings"].map((p) => anon.call(p, { raw: true })));
  for (const r of pages) assert.ok([307, 303, 302].includes(r.status), `/chat etc should redirect, got ${r.status}`);
});

await test("/api/auth/me returns user + settings + features", async () => {
  const { status, data } = await A.call("/api/auth/me");
  assert.strictEqual(status, 200);
  assert.strictEqual(data.user.email, emailA.toLowerCase());
  assert.strictEqual(data.settings.theme, "system");
  assert.ok(typeof data.features.webSearchConfigured === "boolean");
});

await test("password change requires the current password", async () => {
  const { status } = await A.call("/api/auth/password", { method: "POST", body: { currentPassword: "nope", newPassword: "newpassword9" } });
  assert.strictEqual(status, 401);
});

await test("forgot-password responds generically (no account enumeration)", async () => {
  const { status, data } = await anon.call("/api/auth/forgot-password", { method: "POST", body: { email: `ghost-${Date.now()}@x.com` } });
  assert.strictEqual(status, 200);
  assert.ok(data.message.includes("If an account exists"));
});

/* ─── providers ──────────────────────────────────────────────────────────── */

await test("custom provider requires a base URL", async () => {
  const { status, data } = await A.call("/api/providers/test", { method: "POST", body: { providerId: "custom", apiKey: "test-key", baseUrl: "" } });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, false);
  assert.ok(data.message.toLowerCase().includes("base url"));
});

await test("remote http base URLs are rejected (https required)", async () => {
  const { status, data } = await A.call("/api/providers/test", { method: "POST", body: { providerId: "custom", apiKey: "test-key", baseUrl: "http://example.com/v1" } });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, false);
  assert.ok(data.message.includes("https"));
});

await test("connection test detects an invalid API key (no secrets in error)", async () => {
  const { status, data } = await A.call("/api/providers/test", {
    method: "POST",
    body: { providerId: "custom", apiKey: "wrong-key", baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1` },
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, false);
  assert.ok(/invalid|rejected|authentication/i.test(data.message));
  assert.ok(!JSON.stringify(data).includes("wrong-key"));
});

await test("connection test detects an unreachable base URL", async () => {
  const { status, data } = await A.call("/api/providers/test", {
    method: "POST",
    body: { providerId: "custom", apiKey: "test-key", baseUrl: "http://127.0.0.1:9399/v1" },
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, false);
  assert.ok(/reach|network|url/i.test(data.message));
});

await test("user A connects a custom provider (key encrypted at rest)", async () => {
  const { status, data } = await A.call("/api/providers", {
    method: "POST",
    body: { providerId: "custom", label: "Local Mock", apiKey: "test-key", baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1` },
  });
  assert.strictEqual(status, 201, JSON.stringify(data));
  providerIdA = data.credentialId;
  assert.ok(providerIdA);
});

await test("provider list never returns the API key — only a masked hint", async () => {
  const { status, data } = await A.call("/api/providers");
  assert.strictEqual(status, 200);
  const cred = data.providers.find((p) => p.id === providerIdA);
  assert.ok(cred, "credential present");
  assert.ok(cred.keyHint.includes("•"), `hint masked: ${cred.keyHint}`);
  assert.ok(cred.keyHint.endsWith("key") === false || cred.keyHint.includes("•"));
  const serialized = JSON.stringify(data);
  assert.ok(!serialized.includes("test-key"), "raw key must never appear");
});

await test("saved credential passes a live connection test", async () => {
  const { status, data } = await A.call("/api/providers/test", { method: "POST", body: { credentialId: providerIdA } });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, true, data.message);
  assert.strictEqual(data.discoverySupported, true);
});

await test("model discovery populates the registry with capabilities", async () => {
  const { status, data } = await A.call(`/api/providers/${providerIdA}/models`, { method: "POST", body: { discover: true } });
  assert.strictEqual(status, 200, JSON.stringify(data));
  const ids = data.models.map((m) => m.modelId);
  assert.ok(ids.includes("gpt-4o"));
  assert.ok(ids.includes("o3-mini"));
  const gpt4o = data.models.find((m) => m.modelId === "gpt-4o");
  assert.strictEqual(gpt4o.capabilities.vision, true);
  assert.strictEqual(gpt4o.capabilities.toolCalling, true);
  const o3 = data.models.find((m) => m.modelId === "o3-mini");
  assert.strictEqual(o3.capabilities.reasoning, true);
});

await test("model search/filters: GET /api/models returns models + default unset", async () => {
  const { status, data } = await A.call("/api/models");
  assert.strictEqual(status, 200);
  assert.ok(data.models.length >= 4);
  assert.strictEqual(data.defaultModelRef, null);
});

await test("manual model registration works (undiscoverable endpoints)", async () => {
  const { status, data } = await A.call(`/api/providers/${providerIdA}/models`, { method: "POST", body: { modelId: "manual-model-x" } });
  assert.strictEqual(status, 200);
  assert.ok(data.models.some((m) => m.modelId === "manual-model-x" && m.source === "manual"));
});

await test("user A sets a default model", async () => {
  const { status, data } = await A.call("/api/models", { method: "POST", body: { ref: { credentialId: providerIdA, modelId: "gpt-4o" } } });
  assert.strictEqual(status, 200);
  assert.ok(data.defaultModelRef);
});

await test("provider PATCH enable/disable hides models", async () => {
  await A.call(`/api/providers/${providerIdA}`, { method: "PATCH", body: { enabled: false } });
  const { data } = await A.call("/api/models");
  assert.strictEqual(data.models.length, 0, "disabled provider hides models");
  await A.call(`/api/providers/${providerIdA}`, { method: "PATCH", body: { enabled: true } });
  const after = await A.call("/api/models");
  assert.ok(after.data.models.length >= 4);
});

/* ─── chat ───────────────────────────────────────────────────────────────── */

await test("chat: message streams a full response and persists it", async () => {
  const events = await chat(A, { message: "Hello there", webSearch: false });
  const start = events.find((e) => e.type === "start");
  assert.ok(start, "start event");
  conversationId = start.conversationId;
  assert.ok(conversationId);
  const meta = events.find((e) => e.type === "meta");
  assert.strictEqual(meta.model.modelId, "gpt-4o", "default model used");
  const text = events.filter((e) => e.type === "text").map((e) => e.delta).join("");
  assert.ok(text.includes("Hello! How can I help you today?"), `streamed text: ${text}`);
  const done = events.find((e) => e.type === "done");
  assert.ok(done, "done event");
  const usage = events.find((e) => e.type === "usage");
  assert.ok(usage && usage.outputTokens > 0, "usage reported");

  const convo = await A.call(`/api/conversations/${conversationId}`);
  assert.strictEqual(convo.status, 200);
  assert.strictEqual(convo.data.messages.length, 2);
  assert.strictEqual(convo.data.messages[0].role, "user");
  assert.strictEqual(convo.data.messages[1].role, "assistant");
  assert.ok(convo.data.conversation.title.length > 0, "auto title generated");
});

await test("chat: empty message is rejected", async () => {
  const res = await A.call("/api/chat", { method: "POST", body: { message: "   " }, raw: true });
  assert.strictEqual(res.status, 400);
});

await test("chat: conversation history is sent to the provider", async () => {
  const events = await chat(A, { conversationId, message: "Second message please", webSearch: false });
  const text = events.filter((e) => e.type === "text").map((e) => e.delta).join("");
  assert.ok(text.length > 0);
  const convo = await A.call(`/api/conversations/${conversationId}`);
  assert.strictEqual(convo.data.messages.length, 4);
});

await test("chat: explicit model override works (different model)", async () => {
  const events = await chat(A, {
    conversationId,
    message: "Use the other model",
    modelRef: { credentialId: providerIdA, modelId: "o3-mini" },
    webSearch: false,
  });
  const meta = events.find((e) => e.type === "meta");
  assert.strictEqual(meta.model.modelId, "o3-mini");
});

await test("chat: tool calling — calculator executes server-side and result returns", async () => {
  const events = await chat(A, { conversationId, message: "Please calculate 2+2 for me", webSearch: false });
  const toolCall = events.find((e) => e.type === "tool_call" && e.name === "calculator");
  assert.ok(toolCall, "calculator tool_call event");
  const toolResult = events.find((e) => e.type === "tool_result" && e.name === "calculator");
  assert.ok(toolResult, "tool_result event");
  assert.strictEqual(toolResult.ok, true);
  assert.ok(toolResult.summary.includes("4"), `summary: ${toolResult.summary}`);
  const text = events.filter((e) => e.type === "text").map((e) => e.delta).join("");
  assert.ok(text.includes("4"), "model used the tool result");
});

await test("chat: stop generation persists a partial response", async () => {
  const controller = new AbortController();
  const res = await A.call("/api/chat", {
    method: "POST",
    body: { conversationId, message: "Give me a slow answer", webSearch: false },
    raw: true,
    signal: controller.signal,
  });
  assert.strictEqual(res.status, 200);
  const events = await readSSE(
    res,
    (e) => {
      if (e.type === "text") controller.abort();
    },
    { signal: controller.signal }
  );
  assert.ok(events.some((e) => e.type === "text"), "got at least one delta before abort");
  await new Promise((r) => setTimeout(r, 500));
  const convo = await A.call(`/api/conversations/${conversationId}`);
  const last = convo.data.messages[convo.data.messages.length - 1];
  assert.strictEqual(last.role, "assistant");
  assert.strictEqual(last.meta.aborted, true, "aborted flag persisted");
  assert.ok(last.content.length > 0, `partial content saved (${last.content.length} chars)`);
});

await test("chat: regenerate replaces the last assistant message", async () => {
  const before = await A.call(`/api/conversations/${conversationId}`);
  const count = before.data.messages.length;
  const events = await chat(A, { conversationId, regenerate: true, webSearch: false });
  assert.ok(events.find((e) => e.type === "done"));
  const after = await A.call(`/api/conversations/${conversationId}`);
  assert.strictEqual(after.data.messages.length, count, "regenerated message replaces previous");
  const last = after.data.messages[after.data.messages.length - 1];
  assert.strictEqual(last.role, "assistant");
});

await test("chat: fallback model kicks in with a visible notice", async () => {
  await A.call("/api/settings", { method: "PATCH", body: { fallbackEnabled: true, fallbackModelRef: JSON.stringify({ credentialId: providerIdA, modelId: "gpt-4o" }) } });
  const events = await chat(A, {
    conversationId,
    message: "Trigger the failing model",
    modelRef: { credentialId: providerIdA, modelId: "mock-fail" },
    webSearch: false,
  });
  const notice = events.find((e) => e.type === "notice" && e.message.includes("fallback"));
  assert.ok(notice, `fallback notice present: ${events.map((e) => e.type).join(",")}`);
  const meta = events.filter((e) => e.type === "meta").pop();
  assert.strictEqual(meta.model.modelId, "gpt-4o", "answered with fallback model");
  const text = events.filter((e) => e.type === "text").map((e) => e.delta).join("");
  assert.ok(text.length > 0);
  await A.call("/api/settings", { method: "PATCH", body: { fallbackEnabled: false, fallbackModelRef: null } });
});

await test("chat: no fallback → provider failure surfaces a friendly error", async () => {
  const events = await chat(A, {
    conversationId,
    message: "Trigger the failing model again",
    modelRef: { credentialId: providerIdA, modelId: "mock-fail" },
    webSearch: false,
  });
  const err = events.find((e) => e.type === "error");
  assert.ok(err, "error event present");
  assert.ok(/unavailable|overloaded|failed/i.test(err.message), err.message);
  assert.ok(!err.message.includes("\n"), "no stack traces leaked");
});

await test("chat: auto-routing sends images to the vision model", async () => {
  // upload a real 1x1 PNG (magic-byte validated)
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050201cfa02d0d0000000049454e44ae426082",
    "hex"
  );
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "pixel.png");
  const up = await A.call("/api/files", { method: "POST", body: form });
  assert.strictEqual(up.status, 201, JSON.stringify(up.data));
  filePngId = up.data.file.id;
  assert.strictEqual(up.data.file.kind, "image");

  const events = await chat(A, { conversationId, message: "What is in this image?", attachmentIds: [filePngId], autoRoute: true, webSearch: false });
  const meta = events.find((e) => e.type === "meta");
  assert.ok(meta, "meta event");
  assert.ok(["gpt-4o", "o3-mini"].includes(meta.model.modelId), `vision-capable model chosen, got ${meta.model.modelId}`);
  assert.ok(events.find((e) => e.type === "done"));
});

await test("chat: image to non-vision model is refused (capabilities respected)", async () => {
  const events = await chat(A, {
    conversationId,
    message: "analyze this image with a text model",
    attachmentIds: [filePngId],
    modelRef: { credentialId: providerIdA, modelId: "llama-3.1-8b-instant" },
    webSearch: false,
  });
  const err = events.find((e) => e.type === "error");
  assert.ok(err, "error expected");
  assert.ok(err.message.includes("does not support image"), err.message);
});

await test("message feedback (like/dislike) persists", async () => {
  const convo = await A.call(`/api/conversations/${conversationId}`);
  const assistant = [...convo.data.messages].reverse().find((m) => m.role === "assistant" && !m.id.startsWith("tmp"));
  const { status, data } = await A.call(`/api/messages/${assistant.id}/feedback`, { method: "POST", body: { value: 1 } });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.message.meta.feedback, 1);
});

/* ─── conversations ──────────────────────────────────────────────────────── */

await test("conversations: list, search, rename, pin, archive, delete", async () => {
  const list = await A.call("/api/conversations");
  assert.ok(list.data.conversations.length >= 1);
  const search = await A.call(`/api/conversations?q=${encodeURIComponent("Hello there")}`);
  assert.ok(search.data.conversations.some((c) => c.id === conversationId), "search by content");

  const renamed = await A.call(`/api/conversations/${conversationId}`, { method: "PATCH", body: { title: "Renamed chat", pinned: true } });
  assert.strictEqual(renamed.data.conversation.title, "Renamed chat");
  assert.strictEqual(renamed.data.conversation.pinned, true);

  const pinnedList = await A.call("/api/conversations");
  assert.strictEqual(pinnedList.data.conversations[0].id, conversationId, "pinned sorts first");

  await A.call(`/api/conversations/${conversationId}`, { method: "PATCH", body: { archived: true } });
  const activeList = await A.call("/api/conversations");
  assert.ok(!activeList.data.conversations.some((c) => c.id === conversationId), "archived hidden from recents");
  await A.call(`/api/conversations/${conversationId}`, { method: "PATCH", body: { archived: false } });

  const scratch = await A.call("/api/conversations", { method: "POST" });
  const del = await A.call(`/api/conversations/${scratch.data.conversation.id}`, { method: "DELETE" });
  assert.strictEqual(del.status, 200);
});

await test("share link creates a public read-only page and can be revoked", async () => {
  const { status, data } = await A.call(`/api/conversations/${conversationId}/share`, { method: "POST" });
  assert.strictEqual(status, 200);
  sharedUrl = data.url;
  const page = await anon.call(`/share/${data.url.split("/share/")[1]}`, { raw: true });
  assert.strictEqual(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("Renamed chat"));

  await A.call(`/api/conversations/${conversationId}/share`, { method: "DELETE" });
  const gone = await anon.call(`/share/${data.url.split("/share/")[1]}`, { raw: true });
  assert.strictEqual(gone.status, 404);
});

/* ─── files ──────────────────────────────────────────────────────────────── */

await test("files: txt upload extracts text; extension lies are rejected", async () => {
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("The quarterly revenue was 4.2 million dollars.")], { type: "text/plain" }), "notes.txt");
  const up = await A.call("/api/files", { method: "POST", body: form });
  assert.strictEqual(up.status, 201, JSON.stringify(up.data));
  fileTxtId = up.data.file.id;
  assert.strictEqual(up.data.file.kind, "text");
  assert.ok(up.data.file.hasText);

  // fake PDF: text content with a .pdf extension → magic bytes say text → rejected
  const fake = new FormData();
  fake.append("file", new Blob([Buffer.from("just plaintext pretending")], { type: "application/pdf" }), "fake.pdf");
  const bad = await A.call("/api/files", { method: "POST", body: fake });
  assert.strictEqual(bad.status, 415, "fake pdf rejected by content sniffing");

  const tooBig = new FormData();
  tooBig.append("file", new Blob([Buffer.alloc(11 * 1024 * 1024)], { type: "text/plain" }), "big.txt");
  const big = await A.call("/api/files", { method: "POST", body: tooBig });
  assert.strictEqual(big.status, 413);
});

await test("files: real PDF upload extracts text", async () => {
  const pdf = makePdf("PDF TEXT MARKER");
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), "doc.pdf");
  const up = await A.call("/api/files", { method: "POST", body: form });
  assert.strictEqual(up.status, 201, JSON.stringify(up.data));
  assert.strictEqual(up.data.file.kind, "pdf");
  const detail = await A.call(`/api/files/${up.data.file.id}`);
  assert.ok(detail.data.file.textContent.includes("PDF TEXT MARKER"), "pdf text extracted");
});

await test("agent: file_search finds content across uploaded files", async () => {
  const { status, data } = await A.call("/api/agent", { method: "POST", body: { tool: "file_search", args: { query: "quarterly revenue" } } });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, true);
  assert.ok(JSON.stringify(data.output).includes("4.2 million"));
});

await test("agent: calculator tool works via the direct endpoint", async () => {
  const { status, data } = await A.call("/api/agent", { method: "POST", body: { tool: "calculator", args: { expression: "sqrt(144)*3" } } });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.output.value, 36);
});

await test("agent: sandboxed javascript execution is isolated", async () => {
  const { status, data } = await A.call("/api/agent", {
    method: "POST",
    body: { tool: "run_javascript", args: { code: "console.log([1,2,3].map(x => x * 2).join(',')); 6 * 7" } },
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.output.result, 42);
  assert.ok(data.output.logs[0].includes("2,4,6"));
});

await test("agent: unknown tools are rejected", async () => {
  const res = await A.call("/api/agent", { method: "POST", body: { tool: "rm_rf", args: {} } });
  assert.strictEqual(res.status, 422);
});

await test("agent: tool registry is exposed", async () => {
  const { status, data } = await A.call("/api/agent");
  assert.strictEqual(status, 200);
  const names = data.tools.map((t) => t.name);
  for (const expected of ["calculator", "web_search", "fetch_url", "file_search", "run_javascript"]) {
    assert.ok(names.includes(expected), `tool ${expected}`);
  }
});

/* ─── web search (honest behaviour without a key) ────────────────────────── */

await test("search endpoint returns results or an honest failure — never fabricated", async () => {
  const { status, data } = await A.call("/api/search", { method: "POST", body: { query: "openai news" } });
  assert.strictEqual(status, 200);
  assert.ok(typeof data.ok === "boolean");
  if (data.ok) {
    assert.ok(Array.isArray(data.results) && data.results.length > 0);
    assert.ok(data.results[0].url.startsWith("http"));
  } else {
    assert.ok(data.error.length > 10, "failure explains itself");
  }
});

/* ─── compare ────────────────────────────────────────────────────────────── */

await test("compare: two models answer the same question in parallel", async () => {
  const res = await A.call("/api/compare", {
    method: "POST",
    body: { message: "Say hello", refs: [
      { credentialId: providerIdA, modelId: "gpt-4o" },
      { credentialId: providerIdA, modelId: "o3-mini" },
    ] },
    raw: true,
  });
  assert.strictEqual(res.status, 200);
  const events = await readSSE(res);
  const starts = events.filter((e) => e.type === "start");
  assert.strictEqual(starts.length, 2);
  const dones = events.filter((e) => e.type === "done");
  assert.strictEqual(dones.length, 2, "both models finished");
  const refs = new Set(starts.map((s) => s.ref));
  assert.strictEqual(refs.size, 2);
  for (const ref of refs) {
    const text = events.filter((e) => e.type === "delta" && e.ref === ref).map((e) => e.text).join("");
    assert.ok(text.length > 0);
  }
});

/* ─── settings ───────────────────────────────────────────────────────────── */

await test("settings: theme and preferences persist", async () => {
  const { status, data } = await A.call("/api/settings", { method: "PATCH", body: { theme: "dark", sendOnEnter: false } });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.settings.theme, "dark");
  assert.strictEqual(data.settings.sendOnEnter, false);
  const me = await A.call("/api/auth/me");
  assert.strictEqual(me.data.settings.theme, "dark");
  await A.call("/api/settings", { method: "PATCH", body: { theme: "system", sendOnEnter: true } });
});

await test("profile name update", async () => {
  const { status, data } = await A.call("/api/auth/profile", { method: "POST", body: { name: "Alice Cooper" } });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.user.name, "Alice Cooper");
});

/* ─── security: cross-user isolation ─────────────────────────────────────── */

await test("user B cannot read user A's conversation (IDOR protection)", async () => {
  const { status } = await B.call(`/api/conversations/${conversationId}`);
  assert.strictEqual(status, 404);
});

await test("user B cannot modify or delete user A's conversation", async () => {
  const patch = await B.call(`/api/conversations/${conversationId}`, { method: "PATCH", body: { title: "HACKED" } });
  assert.strictEqual(patch.status, 404);
  const del = await B.call(`/api/conversations/${conversationId}`, { method: "DELETE" });
  assert.strictEqual(del.status, 404);
});

await test("user B cannot see, use, or delete user A's provider credential", async () => {
  const list = await B.call("/api/providers");
  assert.ok(!list.data.providers.some((p) => p.id === providerIdA), "A's provider invisible to B");
  const models = await B.call(`/api/providers/${providerIdA}/models`);
  assert.strictEqual(models.status, 404);
  const del = await B.call(`/api/providers/${providerIdA}`, { method: "DELETE" });
  assert.strictEqual(del.status, 404);
  const stillThere = await A.call("/api/providers");
  assert.ok(stillThere.data.providers.some((p) => p.id === providerIdA));
});

await test("user B cannot access user A's files or messages", async () => {
  const file = await B.call(`/api/files/${fileTxtId}`);
  assert.strictEqual(file.status, 404);
  const del = await B.call(`/api/files/${fileTxtId}`, { method: "DELETE" });
  assert.strictEqual(del.status, 404);
  const convo = await A.call(`/api/conversations/${conversationId}`);
  const msgId = convo.data.messages[0].id;
  const fb = await B.call(`/api/messages/${msgId}/feedback`, { method: "POST", body: { value: -1 } });
  assert.strictEqual(fb.status, 404);
});

await test("user B sees none of user A's models", async () => {
  const { data } = await B.call("/api/models");
  assert.strictEqual(data.models.length, 0);
});

/* ─── rate limiting ──────────────────────────────────────────────────────── */

await test("rate limiting: /api/agent throttles above the per-user limit", async () => {
  let saw429 = false;
  for (let i = 0; i < 25 && !saw429; i++) {
    const res = await B.call("/api/agent", { method: "POST", body: { tool: "calculator", args: { expression: "1+1" } } });
    if (res.status === 429) {
      saw429 = true;
      assert.ok(res.data.error.includes("Too many"));
    }
  }
  assert.ok(saw429, "expected a 429 within 25 rapid requests (limit 20/min)");
});

/* ─── logout ─────────────────────────────────────────────────────────────── */

await test("logout invalidates the session", async () => {
  const { status } = await A.call("/api/auth/logout", { method: "POST" });
  assert.strictEqual(status, 200);
  const me = await A.call("/api/auth/me");
  assert.strictEqual(me.status, 401);
});

/* ─── summary ────────────────────────────────────────────────────────────── */

mock.close();
console.log(`\nE2E: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`FAILED: ${f.name} — ${f.err.message}`);
  process.exit(1);
}

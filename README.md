# Nexus AI — Multi-Model AI Assistant Platform

A production-quality, bring-your-own-key AI platform: connect your own provider credentials
(OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Mistral, xAI, or **any OpenAI-compatible
endpoint**), discover models, and chat with all of them through one unified ChatGPT-style
interface — with agent tools, web research, model comparison, auto-routing and fallback.

**This is a real application, not a demo.** Every button, route, credential flow, stream and
database operation is implemented and covered by an automated end-to-end suite (55 E2E +
26 unit tests) that runs the full pipeline against a real local OpenAI-compatible server.

---

## Stack

| Layer     | Choice |
|-----------|--------|
| Framework | Next.js 15 (App Router, TypeScript, strict) — full-stack, one deployable |
| Database  | SQLite via Node's built-in `node:sqlite` (WAL, zero native deps) |
| Auth      | httpOnly JWT session cookies (jose) + bcrypt password hashes + optional Google OAuth |
| Secrets   | AES-256-GCM envelope encryption for provider API keys at rest |
| UI        | Tailwind CSS (light/dark/system), Lucide icons, no other UI dependency |
| Files     | pdfjs-dist (PDF), mammoth (DOCX), magic-byte validation server-side |

## Feature map

- **Multi-provider architecture** — `AIProviderManager`, `ProviderAdapter` (OpenAI-completions /
  Anthropic-messages / Google-generative protocols), `ModelRegistry`, `CapabilityDetector`,
  `CredentialManager`, `ChatService`, `AgentService`/`ToolService` (`src/lib/`).
- **Provider onboarding** — add/configure/remove/enable/disable providers, live **Test
  Connection** (verifies key, base URL, protocol compatibility — never fakes it), **Discover
  Models** with capability table (Vision / Tools / Streaming / Reasoning, "Unknown" is shown as
  unknown — never guessed), optional Organization/Project IDs, manual model registration for
  endpoints without discovery.
- **Security** — keys are encrypted at rest and decrypted only in-memory, server-side; the
  browser only ever sees masked hints like `sk-••••••1234`; every query is scoped by `user_id`
  (IDOR-safe); server-side rate limiting on auth/chat/search/files/provider endpoints;
  structured JSON logs with request IDs that never log secrets; stack traces never reach clients.
- **Chat** — real SSE streaming with stop / retry / regenerate / regenerate-with-another-model,
  reasoning ("thinking") panels, usage stats, auto-titles, search/rename/pin/archive/delete,
  shareable public read-only links, like/dislike/report feedback.
- **Agent tools** — `calculator` (safe shunting-yard parser, no `eval`), `web_search`
  (Tavily/Serper/Brave via env, honest best-effort DuckDuckGo fallback), `fetch_url`,
  `file_search` (keyword search over your uploads), `run_javascript` (VM-sandboxed, 2s CPU
  budget, no network/fs). Tools are only offered to models that declare tool-calling support;
  otherwise search results are injected into context directly.
- **Auto model routing** — capability-aware routing across *your connected models only*
  (images → vision models, complex prompts → reasoning models, quick questions → fast models).
- **Model fallback** — retry then failover to your configured fallback model, always with a
  visible notice; never silently switches.
- **Compare models** — ask up to 3 models the same question; parallel streamed responses
  side-by-side (stacked cards on mobile) with latency and token usage.
- **Files** — PDF/TXT/MD/CSV/JSON/DOCX + images; validated by magic bytes (extensions are
  never trusted), size-limited, text-extracted and searchable; images gated to vision-capable
  models.
- **Voice input** — Web Speech API with graceful fallback message on unsupported browsers.
- **Responsive & accessible** — 320px→1440px+, drawer sidebar on mobile, ARIA labels on every
  icon button, keyboard navigation, semantic HTML, focus states.

## Quick start

```bash
cp .env.example .env          # optional — sane dev defaults work out of the box
npm install
npm run build && npm start    # or: npm run dev
# open http://localhost:3000
```

1. Create an account.
2. Go to **AI Models → Add provider**, paste an API key, press **Test Connection**, then
   **Discover Models**.
3. Chat. Pick a model in the header or leave it on **Auto**.

For the custom provider, use any OpenAI-compatible endpoint (e.g. a local LLM server):
Base URL `http://127.0.0.1:11434/v1`, your key, and a model ID. The connection test verifies
the endpoint really speaks the OpenAI chat-completions protocol before saving.

## Environment variables

See [`.env.example`](./.env.example). Everything optional in development:

- `AUTH_SECRET`, `ENCRYPTION_KEY` — **required for production** (32-byte hex; `openssl rand -hex 32`).
- `DATABASE_PATH` — SQLite file (default `./data/app.db`).
- `APP_URL` — public URL (share links, OAuth redirect).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — enables Google login when both are set.
- `TAVILY_API_KEY` / `SERPER_API_KEY` / `BRAVE_API_KEY` — first configured wins for web search.
- `MAX_UPLOAD_MB`, `RATE_LIMIT_*` — uploads and rate limits.

## Testing

```bash
npm test            # 26 unit tests (calculator, crypto, capabilities, router, rate limit, base URL)
npm run build       # production build + full type-check
npm run test:e2e    # 55 end-to-end tests against a running server (localhost:3000)
```

The E2E suite spins up a real OpenAI-compatible mock provider on `127.0.0.1:8787` and covers:
auth (signup/login/logout/protected routes), provider connect/test/discover/remove, live SSE
chat, tool calling, stop/regenerate, fallback + failure notices, capability gating (refuses
images on non-vision models), auto-routing, conversations CRUD + search + share links, file
upload validation (fake PDFs rejected by magic bytes, size limits, real PDF text extraction),
all agent tools, compare, settings, cross-user isolation (user B can never touch user A's
conversations, credentials, models or files), rate limiting and logout.

## Project layout

```
src/
  app/                 # routes: /(app) chat, models, files, settings, help · /login /signup … · /share/[token] · /api/*
  components/          # app shell, chat view, composer, model selector, message list, compare, ui primitives
  lib/
    providers/         # adapters (openai-compat, anthropic, google), registry + capability KB, manager
    agent.ts           # auto model router
    chat-service.ts    # turn orchestrator (streaming, tools, fallback, persistence)
    tools.ts           # agent tool registry + sandboxed execution
    search.ts          # web search providers + readable URL fetch
    files.ts           # upload validation + text extraction
    auth.ts db.ts crypto.ts rate-limit.ts logger.ts api.ts conversations.ts
scripts/
  e2e.mjs              # E2E suite
  mock-openai.mjs      # real OpenAI-protocol mock provider used by E2E
tests/unit/            # unit tests
```

## Honest limitations

- Web search without a configured search API relies on a DuckDuckGo HTML fallback that may be
  rate-limited; failures are reported to the user, never faked.
- Password-reset emails require an SMTP setup this self-hosted build doesn't include; reset
  links are issued into the server log for the operator (stated in the UI, not hidden).
- Model capability metadata comes from providers when exposed, otherwise from a maintained
  knowledge base; anything unknown is displayed as "Unknown" and treated as unsupported.
- The in-memory rate limiter suits single-node deployments (swap for Redis behind a load balancer).

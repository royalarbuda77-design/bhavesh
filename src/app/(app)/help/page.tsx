import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CircleHelp, Code2, Cpu, FileText, Globe, KeyRound, Keyboard, LifeBuoy, Lock, Search, Sparkles } from "lucide-react";

export const metadata: Metadata = { title: "Help" };

const PROVIDER_LINKS: { name: string; url: string }[] = [
  { name: "OpenAI", url: "https://platform.openai.com/api-keys" },
  { name: "Anthropic", url: "https://console.anthropic.com/settings/keys" },
  { name: "Google AI Studio (Gemini)", url: "https://aistudio.google.com/app/apikey" },
  { name: "OpenRouter", url: "https://openrouter.ai/keys" },
  { name: "Groq", url: "https://console.groq.com/keys" },
  { name: "Mistral", url: "https://console.mistral.ai/api-keys" },
  { name: "xAI", url: "https://console.x.ai" },
];

export default function HelpPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-surface-border px-4 sm:px-6">
        <CircleHelp size={18} className="text-accent" aria-hidden />
        <h1 className="text-[15px] font-semibold text-ink-primary">Help &amp; Documentation</h1>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-6 sm:px-6">
          <section aria-labelledby="help-start">
            <h2 id="help-start" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <Sparkles size={14} aria-hidden /> Getting started
            </h2>
            <ol className="space-y-3 rounded-2xl border border-surface-border bg-surface-raised p-4 text-[13.5px] leading-relaxed text-ink-secondary">
              <li>
                <strong className="text-ink-primary">1. Connect a provider.</strong> Go to <Link href="/models" className="text-accent hover:underline">AI Models</Link>, click
                &ldquo;Add provider&rdquo;, paste your API key and press <em>Test Connection</em>. Keys are encrypted (AES-256-GCM) and stored server-side — the browser never sees them again after saving.
              </li>
              <li>
                <strong className="text-ink-primary">2. Discover models.</strong> Press <em>Discover Models</em> to pull the live model list from the provider. Capabilities (vision, tools, reasoning) come from provider metadata or a maintained registry — &ldquo;Unknown&rdquo; means unknown, never guessed.
              </li>
              <li>
                <strong className="text-ink-primary">3. Chat.</strong> Pick a model in the chat header (or use <em>Auto</em> routing), attach files, enable web search, and compare models side by side.
              </li>
            </ol>
          </section>

          <section aria-labelledby="help-keys">
            <h2 id="help-keys" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <KeyRound size={14} aria-hidden /> Where do I get API keys?
            </h2>
            <ul className="divide-y divide-surface-border rounded-2xl border border-surface-border bg-surface-raised">
              {PROVIDER_LINKS.map((p) => (
                <li key={p.name}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-4 py-3 text-[13.5px] text-ink-primary hover:bg-surface-hover">
                    {p.name}
                    <span aria-hidden>↗</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-secondary">
              Nexus AI is bring-your-own-key: requests go from this server directly to the provider using your saved
              credential. Nothing is proxied through third parties.
            </p>
          </section>

          <section aria-labelledby="help-tools">
            <h2 id="help-tools" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <Code2 size={14} aria-hidden /> Agent tools
            </h2>
            <div className="space-y-2 rounded-2xl border border-surface-border bg-surface-raised p-4 text-[13px] leading-relaxed text-ink-secondary">
              <p className="flex gap-2"><Globe size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden /><span><strong className="text-ink-primary">web_search</strong> — live web results with cited sources. Configure TAVILY_API_KEY, SERPER_API_KEY or BRAVE_API_KEY in the server environment for reliable results; without a key a best-effort DuckDuckGo fallback is used and may fail.</span></p>
              <p className="flex gap-2"><Search size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden /><span><strong className="text-ink-primary">fetch_url</strong> — reads a web page the model wants to inspect.</span></p>
              <p className="flex gap-2"><FileText size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden /><span><strong className="text-ink-primary">file_search</strong> — keyword search over your uploaded documents.</span></p>
              <p className="flex gap-2"><Code2 size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden /><span><strong className="text-ink-primary">calculator</strong> — exact arithmetic (safe parser, no eval).</span></p>
              <p className="flex gap-2"><Code2 size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden /><span><strong className="text-ink-primary">run_javascript</strong> — short snippets in an isolated VM sandbox (no network, no filesystem, 2s CPU budget).</span></p>
              <p className="text-[12px] text-ink-tertiary">Tools are only offered to models that declare tool-calling support; on models without it, web-search results are injected into the context directly instead.</p>
            </div>
          </section>

          <section aria-labelledby="help-custom">
            <h2 id="help-custom" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <Cpu size={14} aria-hidden /> Custom OpenAI-compatible providers
            </h2>
            <p className="rounded-2xl border border-surface-border bg-surface-raised p-4 text-[13px] leading-relaxed text-ink-secondary">
              Choose <strong className="text-ink-primary">Custom</strong> when adding a provider, then enter a name, base URL
              (e.g. <code className="rounded bg-surface px-1 font-mono text-[12px]">https://example.com/v1</code>), your key and a
              model ID. The connection test verifies the endpoint really speaks the OpenAI chat-completions protocol before
              saving — if it doesn&apos;t, you&apos;ll see &ldquo;This provider is not compatible with the selected adapter.&rdquo;
              rather than silent breakage. Plain http:// is only allowed for localhost endpoints.
            </p>
          </section>

          <section aria-labelledby="help-shortcuts">
            <h2 id="help-shortcuts" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <Keyboard size={14} aria-hidden /> Keyboard shortcuts
            </h2>
            <div className="grid gap-2 rounded-2xl border border-surface-border bg-surface-raised p-4 text-[13px] text-ink-secondary sm:grid-cols-2">
              <p><kbd className="rounded border border-surface-border bg-surface px-1.5 py-0.5 font-mono text-[11px]">Enter</kbd> send message</p>
              <p><kbd className="rounded border border-surface-border bg-surface px-1.5 py-0.5 font-mono text-[11px]">Shift + Enter</kbd> new line</p>
              <p><kbd className="rounded border border-surface-border bg-surface px-1.5 py-0.5 font-mono text-[11px]">Esc</kbd> close dialogs</p>
            </div>
          </section>

          <section aria-labelledby="help-security">
            <h2 id="help-security" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <Lock size={14} aria-hidden /> Security &amp; privacy notes
            </h2>
            <ul className="list-disc space-y-1.5 rounded-2xl border border-surface-border bg-surface-raised p-4 pl-8 text-[13px] leading-relaxed text-ink-secondary">
              <li>API keys are encrypted at rest with AES-256-GCM and are only ever decrypted in memory, server-side, to call the provider.</li>
              <li>Sessions are httpOnly JWT cookies; passwords are bcrypt-hashed.</li>
              <li>Every database query is scoped by user ID — users cannot read each other&apos;s chats, files or credentials.</li>
              <li>Forgot-password: this self-hosted build has no SMTP configured. Requesting a reset issues a link into the server log for the operator to hand over — stated honestly rather than faked.</li>
            </ul>
          </section>

          <section aria-labelledby="help-ops">
            <h2 id="help-ops" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-tertiary">
              <LifeBuoy size={14} aria-hidden /> Self-hosting
            </h2>
            <p className="rounded-2xl border border-surface-border bg-surface-raised p-4 text-[13px] leading-relaxed text-ink-secondary">
              Set <code className="rounded bg-surface px-1 font-mono text-[12px]">AUTH_SECRET</code>,{" "}
              <code className="rounded bg-surface px-1 font-mono text-[12px]">ENCRYPTION_KEY</code> and optionally{" "}
              <code className="rounded bg-surface px-1 font-mono text-[12px]">APP_URL</code> in the environment (see{" "}
              <code className="rounded bg-surface px-1 font-mono text-[12px]">.env.example</code>). The SQLite database lives at{" "}
              <code className="rounded bg-surface px-1 font-mono text-[12px]">data/app.db</code>. Run{" "}
              <code className="rounded bg-surface px-1 font-mono text-[12px]">npm run build &amp;&amp; npm start</code>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

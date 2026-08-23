import { config } from "./env";

/**
 * Web search service. Uses the first configured search API (Tavily, Serper,
 * Brave); falls back to a best-effort DuckDuckGo HTML scrape. If everything
 * fails we report failure honestly — the agent never fabricates results.
 */

export type SearchResult = { title: string; url: string; snippet: string };
export type SearchOutcome =
  | { ok: true; results: SearchResult[]; provider: string }
  | { ok: false; error: string; provider: string };

export async function webSearch(query: string, count = 5): Promise<SearchOutcome> {
  const q = query.trim();
  if (!q) return { ok: false, error: "Empty search query.", provider: "none" };
  const providers: [string, () => Promise<SearchOutcome>][] = [];
  if (config.search.tavilyKey) providers.push(["tavily", () => tavilySearch(q, count)]);
  if (config.search.serperKey) providers.push(["serper", () => serperSearch(q, count)]);
  if (config.search.braveKey) providers.push(["brave", () => braveSearch(q, count)]);
  providers.push(["duckduckgo", () => duckSearch(q, count)]);

  for (const [name, fn] of providers) {
    try {
      const outcome = await fn();
      if (outcome.ok) return outcome;
    } catch {
      /* try next provider */
    }
  }
  return {
    ok: false,
    error:
      "Web search is currently unavailable. No search API key is configured on this server (TAVILY_API_KEY / SERPER_API_KEY / BRAVE_API_KEY in .env) and the DuckDuckGo fallback failed.",
    provider: "none",
  };
}

async function tavilySearch(query: string, count: number): Promise<SearchOutcome> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: config.search.tavilyKey, query, max_results: count, search_depth: "basic" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { ok: false, error: `Tavily error (HTTP ${res.status}).`, provider: "tavily" };
  const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  const results = (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title ?? r.url!, url: r.url!, snippet: (r.content ?? "").slice(0, 400) }));
  return { ok: true, results, provider: "tavily" };
}

async function serperSearch(query: string, count: number): Promise<SearchOutcome> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": config.search.serperKey },
    body: JSON.stringify({ q: query, num: count }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { ok: false, error: `Serper error (HTTP ${res.status}).`, provider: "serper" };
  const data = (await res.json()) as { organic?: { title?: string; link?: string; snippet?: string }[] };
  const results = (data.organic ?? [])
    .filter((r) => r.link)
    .slice(0, count)
    .map((r) => ({ title: r.title ?? r.link!, url: r.link!, snippet: (r.snippet ?? "").slice(0, 400) }));
  return { ok: true, results, provider: "serper" };
}

async function braveSearch(query: string, count: number): Promise<SearchOutcome> {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": config.search.braveKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { ok: false, error: `Brave error (HTTP ${res.status}).`, provider: "brave" };
  const data = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
  const results = (data.web?.results ?? [])
    .filter((r) => r.url)
    .slice(0, count)
    .map((r) => ({ title: r.title ?? r.url!, url: r.url!, snippet: (r.description ?? "").slice(0, 400) }));
  return { ok: true, results, provider: "brave" };
}

async function duckSearch(query: string, count: number): Promise<SearchOutcome> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NexusAI/1.0)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return { ok: false, error: `DuckDuckGo error (HTTP ${res.status}).`, provider: "duckduckgo" };
  const html = await res.text();
  const results: SearchResult[] = [];
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html))) snippets.push(stripTags(sm[1]));
  let lm: RegExpExecArray | null;
  let i = 0;
  while ((lm = linkRe.exec(html)) && results.length < count) {
    let url = lm[1];
    const uddg = /[?&]uddg=([^&]+)/.exec(url);
    if (uddg) {
      try {
        url = decodeURIComponent(uddg[1]);
      } catch { /* keep raw */ }
    }
    if (!/^https?:\/\//.test(url)) { i++; continue; }
    results.push({ title: stripTags(lm[2]) || url, url, snippet: (snippets[i] ?? "").slice(0, 400) });
    i++;
  }
  if (results.length === 0) return { ok: false, error: "DuckDuckGo returned no parseable results.", provider: "duckduckgo" };
  return { ok: true, results, provider: "duckduckgo" };
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch a URL and extract readable text (used by the fetch_url agent tool). */
export async function fetchUrlReadable(url: string, maxChars = 16_000): Promise<{ ok: true; title: string; text: string } | { ok: false; error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false, error: "Only http(s) URLs can be fetched." };
  try {
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NexusAI/1.0)", Accept: "text/html,application/json;text/plain,*/*" },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, error: `Fetch failed (HTTP ${res.status}).` };
    const contentType = res.headers.get("content-type") ?? "";
    const body = (await res.text()).slice(0, 500_000);
    if (contentType.includes("application/json")) return { ok: true, title: parsed.hostname, text: body.slice(0, maxChars) };
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
    const text = stripTags(body.replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ""));
    return { ok: true, title: titleMatch ? stripTags(titleMatch[1]) : parsed.hostname, text: text.slice(0, maxChars) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || /timeout/i.test(msg)) return { ok: false, error: "Fetch timed out." };
    return { ok: false, error: "Could not fetch the URL." };
  }
}

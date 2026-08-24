import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getConversationByShareId } from "@/lib/conversations";
import { listMessagesByShare } from "@/lib/share-queries";
import { Markdown } from "@/components/markdown";

export const metadata: Metadata = { title: "Shared conversation" };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conversation = getConversationByShareId(token);
  if (!conversation) notFound();
  const messages = listMessagesByShare(conversation.id);

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-10 border-b border-surface-border bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <Sparkles size={15} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[14.5px] font-semibold text-ink-primary">{conversation.title}</h1>
            <p className="text-[11.5px] text-ink-tertiary">
              Shared from Nexus AI · read-only
            </p>
          </div>
          <Link href="/" className="ml-auto shrink-0 text-[12.5px] font-medium text-accent hover:underline">
            Try Nexus AI
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="mb-6 flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-accent-fg">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="mb-7">
              <div className="mb-1.5 text-[12px] font-medium text-ink-secondary">{m.meta.model ?? m.modelId ?? "Assistant"}</div>
              <Markdown text={m.content || "(no content)"} />
              {m.meta.sources?.length ? (
                <ul className="mt-3 space-y-1">
                  {m.meta.sources.map((s, i) => (
                    <li key={i}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[12.5px] text-accent hover:underline">
                        [{i + 1}] {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )
        )}
      </main>
    </div>
  );
}

"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  Bot,
  CircleHelp,
  Cpu,
  FolderOpen,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import type { UserSettings } from "@/lib/auth";
import type { ModelDTO } from "@/lib/providers/manager";
import type { ConversationDTO } from "@/lib/conversations";
import { authApi, conversationsApi, modelsApi, settingsApi, type MeResponse } from "@/lib/api-client";
import { Button, Dropdown, MenuItem, Spinner, ToastProvider, useToast } from "./ui";
import { InstallAppButton } from "./install-app";

/* ─── context ────────────────────────────────────────────────────────────── */

type AppCtx = {
  me: MeResponse;
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>, optimistic?: boolean) => Promise<void>;
  models: ModelDTO[];
  defaultModelRef: { credentialId: string; modelId: string } | null;
  refreshModels: () => Promise<void>;
  conversations: ConversationDTO[];
  refreshConversations: () => Promise<void>;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  theme: "light" | "dark" | "system";
};

const AppContext = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppShell");
  return ctx;
}

function applyTheme(theme: UserSettings["theme"]) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("nexus-theme", theme);
  } catch { /* private mode */ }
}

/* ─── shell ──────────────────────────────────────────────────────────────── */

export function AppShell({ initialMe, children }: { initialMe: MeResponse; children: React.ReactNode }) {
  const [me] = useState(initialMe);
  const [settings, setSettings] = useState<UserSettings>(initialMe.settings);
  const [models, setModels] = useState<ModelDTO[]>([]);
  const [defaultModelRef, setDefaultModelRef] = useState<{ credentialId: string; modelId: string } | null>(
    initialMe.settings.defaultModelRef ? JSON.parse(initialMe.settings.defaultModelRef) : null
  );
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<UserSettings["theme"]>(initialMe.settings.theme);

  useEffect(() => {
    setTheme(settings.theme);
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme]);

  const refreshModels = useCallback(async () => {
    try {
      const data = await modelsApi.list();
      setModels(data.models);
      setDefaultModelRef(data.defaultModelRef ? JSON.parse(data.defaultModelRef) : null);
    } catch { /* transient */ }
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const data = await conversationsApi.list();
      setConversations(data.conversations);
    } catch { /* transient */ }
  }, []);

  useEffect(() => {
    void refreshModels();
    void refreshConversations();
  }, [refreshModels, refreshConversations]);

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>, optimistic = true) => {
      if (optimistic) setSettings((s) => ({ ...s, ...patch }));
      try {
        const data = await settingsApi.patch(patch);
        setSettings(data.settings);
      } catch {
        const data = await settingsApi.get().catch(() => null);
        if (data) setSettings(data.settings);
      }
    },
    []
  );

  const value = useMemo<AppCtx>(
    () => ({
      me,
      settings,
      updateSettings,
      models,
      defaultModelRef,
      refreshModels,
      conversations,
      refreshConversations,
      sidebarOpen,
      setSidebarOpen,
      theme,
    }),
    [me, settings, updateSettings, models, defaultModelRef, refreshModels, conversations, refreshConversations, sidebarOpen, theme]
  );

  return (
    <AppContext.Provider value={value}>
      <ToastProvider>
        <div className="flex h-dvh overflow-hidden bg-surface">
          <Sidebar />
          <main className="relative flex min-w-0 flex-1 flex-col">{children}</main>
        </div>
      </ToastProvider>
    </AppContext.Provider>
  );
}

/* ─── sidebar ────────────────────────────────────────────────────────────── */

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Sidebar() {
  const { conversations, refreshConversations, sidebarOpen, setSidebarOpen, me } = useApp();
  const { push } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ConversationDTO[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await conversationsApi.list(query.trim());
        setSearchResults(data.conversations);
      } catch { /* transient */ }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const visible = searchResults ?? (showArchived ? [] : conversations.filter((c) => !c.archived));
  const favorites = visible.filter((c) => c.pinned);
  const recents = visible.filter((c) => !c.pinned);

  const navItem = (href: string, icon: React.ReactNode, label: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors ${
          active ? "bg-accent-subtle text-accent" : "text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
        }`}
      >
        {icon}
        {label}
      </Link>
    );
  };

  return (
    <>
      {/* mobile backdrop */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-30 bg-black/45 animate-fade-in md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] shrink-0 flex-col border-r border-surface-border bg-surface-raised transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Sidebar"
      >
        {/* brand */}
        <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg shadow-subtle">
            <Sparkles size={17} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight text-ink-primary">Nexus AI</div>
            <div className="truncate text-[11px] text-ink-tertiary">Multi-model assistant</div>
          </div>
          <button
            className="ml-auto rounded-md p-1.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3 pt-2">
          <Link href="/chat" onClick={() => setSidebarOpen(false)}>
            <Button className="w-full" size="md">
              <Plus size={16} aria-hidden /> New Chat
            </Button>
          </Link>
        </div>

        {/* search */}
        <div className="px-3 pt-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              aria-label="Search conversations"
              className="h-9 w-full rounded-lg border border-surface-border bg-surface pl-8.5 pr-3 text-[13px] text-ink-primary placeholder:text-ink-tertiary focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* conversations */}
        <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-2" aria-label="Conversations">
          <ConversationSection title={favorites.length ? "Favorites" : undefined} items={favorites} onChanged={refreshConversations} />
          <ConversationSection title="Recents" items={recents} onChanged={refreshConversations} />
          {visible.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-[12.5px] leading-relaxed text-ink-tertiary">
              {query ? `No chats matching “${query}”.` : showArchived ? "No archived chats." : "No chats yet — start a new conversation."}
            </p>
          ) : null}
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary"
            aria-expanded={showArchived}
          >
            <Archive size={17} aria-hidden /> Archived
          </button>
        </nav>

        {/* nav */}
        <nav className="border-t border-surface-border px-3 py-2" aria-label="Main">
          {navItem("/models", <Cpu size={17} aria-hidden />, "AI Models")}
          {navItem("/files", <Paperclip size={17} aria-hidden />, "Files")}
          {navItem("/settings", <Settings size={17} aria-hidden />, "Settings")}
          {navItem("/help", <CircleHelp size={17} aria-hidden />, "Help")}
          <div className="pt-2">
            <InstallAppButton className="w-full justify-center" />
          </div>
        </nav>

        {/* profile */}
        <div className="border-t border-surface-border p-3">
          <UserProfile
            name={me.user.name}
            email={me.user.email}
            singleUser={me.features.singleUser}
            onSignOut={async () => {
              try {
                await authApi.logout();
              } finally {
                router.push("/login");
              }
            }}
          />
        </div>
      </aside>
    </>
  );
}

function ConversationSection({
  title,
  items,
  onChanged,
}: {
  title?: string;
  items: ConversationDTO[];
  onChanged: () => Promise<void>;
}) {
  const { push } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ConversationDTO | null>(null);
  const [renameValue, setRenameValue] = useState("");

  if (items.length === 0) return null;

  const act = async (fn: () => Promise<unknown>, message?: string) => {
    try {
      await fn();
      await onChanged();
      if (message) push(message, "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Action failed.", "error");
    }
  };

  return (
    <div className="mb-2">
      {title ? (
        <h3 className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">{title}</h3>
      ) : null}
      <ul>
        {items.map((c) => {
          const active = pathname === `/chat/${c.id}`;
          return (
            <li key={c.id} className="group relative">
              {renaming?.id === c.id ? (
                <form
                  className="px-1 py-0.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const title = renameValue.trim() || c.title;
                    setRenaming(null);
                    void act(() => conversationsApi.update(c.id, { title }), "Chat renamed.");
                  }}
                >
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => setRenaming(null)}
                    onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                    aria-label="Rename chat"
                    className="h-8 w-full rounded-md border border-accent bg-surface px-2 text-[13px] text-ink-primary focus:outline-none"
                  />
                </form>
              ) : (
                <Link
                  href={`/chat/${c.id}`}
                  className={`flex items-center gap-2 rounded-lg py-2 pl-2.5 pr-8 text-[13.5px] transition-colors ${
                    active ? "bg-surface-hover text-ink-primary" : "text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
                  }`}
                >
                  {c.pinned ? <Pin size={13} className="shrink-0 text-accent" aria-hidden /> : <MessageSquare size={13} className="shrink-0 opacity-60" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="shrink-0 text-[11px] text-ink-tertiary group-hover:hidden">{timeAgo(c.updatedAt)}</span>
                </Link>
              )}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  aria-label={`Options for ${c.title}`}
                  className="rounded-md p-1 text-ink-tertiary hover:bg-surface hover:text-ink-primary"
                  onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                >
                  <MoreHorizontal size={15} />
                </button>
                <Dropdown open={menuFor === c.id} onClose={() => setMenuFor(null)}>
                  <MenuItem
                    icon={c.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    onClick={() => {
                      setMenuFor(null);
                      void act(() => conversationsApi.update(c.id, { pinned: !c.pinned }), c.pinned ? "Removed from favorites." : "Added to favorites.");
                    }}
                  >
                    {c.pinned ? "Unfavorite" : "Favorite"}
                  </MenuItem>
                  <MenuItem
                    icon={<Pencil size={14} />}
                    onClick={() => {
                      setMenuFor(null);
                      setRenameValue(c.title);
                      setRenaming(c);
                    }}
                  >
                    Rename
                  </MenuItem>
                  <MenuItem
                    icon={c.archived ? <FolderOpen size={14} /> : <Archive size={14} />}
                    onClick={() => {
                      setMenuFor(null);
                      void act(() => conversationsApi.update(c.id, { archived: !c.archived }), c.archived ? "Chat restored." : "Chat archived.");
                      if (!c.archived && pathname === `/chat/${c.id}`) router.push("/chat");
                    }}
                  >
                    {c.archived ? "Unarchive" : "Archive"}
                  </MenuItem>
                  <MenuItem
                    icon={<Trash2 size={14} />}
                    danger
                    onClick={() => {
                      setMenuFor(null);
                      void act(() => conversationsApi.remove(c.id), "Chat deleted.");
                      if (pathname === `/chat/${c.id}`) router.push("/chat");
                    }}
                  >
                    Delete
                  </MenuItem>
                </Dropdown>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function UserProfile({ name, email, onSignOut, singleUser }: { name: string; email: string; onSignOut: () => Promise<void>; singleUser?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[12px] font-semibold text-accent">
          {initials || <User size={15} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink-primary">{name}</span>
          <span className="block truncate text-[11px] text-ink-tertiary">{singleUser ? "Personal mode — no login" : email}</span>
        </span>
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)} className="bottom-full right-0 top-auto mb-1.5 w-52">
        <MenuItem
          icon={<User size={14} />}
          onClick={() => {
            setOpen(false);
            window.location.href = "/settings";
          }}
        >
          Profile & settings
        </MenuItem>
        {singleUser ? null : (
          <MenuItem
            icon={busy ? <Spinner size={14} /> : <LogOut size={14} />}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              await onSignOut();
            }}
          >
            Sign out
          </MenuItem>
        )}
      </Dropdown>
    </div>
  );
}

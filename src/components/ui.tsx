"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, Info, Loader2, TriangleAlert, X } from "lucide-react";

/* ─── Button ─────────────────────────────────────────────────────────────── */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className = "", children, disabled, ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors select-none disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<string, string> = {
    primary: "bg-accent text-accent-fg hover:bg-accent-hover",
    secondary: "border border-surface-border bg-surface text-ink-primary hover:bg-surface-hover",
    ghost: "text-ink-secondary hover:bg-surface-hover hover:text-ink-primary",
    danger: "bg-danger text-white hover:opacity-90",
    subtle: "bg-accent-subtle text-accent hover:brightness-95 dark:hover:brightness-125",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-[13px]",
    md: "h-9.5 px-4 text-sm",
    lg: "h-11 px-5 text-[15px]",
    icon: "h-9 w-9",
  };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/* ─── Input / Textarea ───────────────────────────────────────────────────── */

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-10 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-ink-primary placeholder:text-ink-tertiary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${className}`}
      {...props}
    />
  );
}

export function Label({ children, htmlFor, hint }: { children: React.ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-secondary">
      {children}
      {hint ? <span className="ml-1.5 font-normal text-ink-tertiary">{hint}</span> : null}
    </label>
  );
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 animate-fade-in sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={ref}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-surface-border bg-surface-overlay shadow-pop animate-fade-up sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-surface-border px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-primary">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] text-ink-secondary">{description}</p> : null}
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-md p-1.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ─── Badge / capability badges ──────────────────────────────────────────── */

export function Badge({ children, tone = "neutral", className = "" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "danger"; className?: string }) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-raised text-ink-secondary border-surface-border",
    accent: "bg-accent-subtle text-accent border-accent/20",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/25",
    danger: "bg-danger/10 text-danger border-danger/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

/* ─── Toggle ─────────────────────────────────────────────────────────────── */

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-accent" : "bg-surface-border"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/* ─── Toasts ─────────────────────────────────────────────────────────────── */

type Toast = { id: number; message: string; tone: "info" | "success" | "error" };
type ToastCtx = { push: (message: string, tone?: Toast["tone"]) => void };

const ToastContext = createContext<ToastCtx>({ push: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-4), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-card animate-fade-up bg-surface-overlay ${
              t.tone === "success" ? "border-success/30" : t.tone === "error" ? "border-danger/30" : "border-surface-border"
            }`}
          >
            {t.tone === "success" ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
            ) : t.tone === "error" ? (
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
            ) : (
              <Info size={16} className="mt-0.5 shrink-0 text-accent" />
            )}
            <span className="text-ink-primary">{t.message}</span>
            <button
              aria-label="Dismiss notification"
              className="ml-auto shrink-0 text-ink-tertiary hover:text-ink-primary"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ─── misc ───────────────────────────────────────────────────────────────── */

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} aria-hidden />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-surface-border px-6 py-14 text-center">
      {icon ? <div className="text-ink-tertiary">{icon}</div> : null}
      <div>
        <h3 className="text-[15px] font-semibold text-ink-primary">{title}</h3>
        {description ? <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-ink-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Dropdown({ open, onClose, children, align = "right", className = "" }: { open: boolean; onClose: () => void; children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute top-full z-40 mt-1.5 min-w-44 overflow-hidden rounded-xl border border-surface-border bg-surface-overlay py-1.5 shadow-pop animate-fade-up ${align === "right" ? "right-0" : "left-0"} ${className}`}
    >
      {children}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger, disabled }: { icon?: React.ReactNode; children: React.ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors disabled:opacity-40 ${
        danger ? "text-danger hover:bg-danger/10" : "text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
      }`}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { authApi } from "@/lib/api-client";
import { Button, Input, Label } from "@/components/ui";
import { InstallAppButton } from "@/components/install-app";

function Shell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link href="/" className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-subtle" aria-label="Nexus AI home">
            <Sparkles size={21} aria-hidden />
          </Link>
          <h1 className="text-xl font-semibold text-ink-primary">{title}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-overlay p-5 shadow-card">{children}</div>
        <div className="mt-4 text-center text-[13px] text-ink-secondary">{footer}</div>
      </div>
    </div>
  );
}

export function AuthCard({ mode, googleEnabled, error }: { mode: "login" | "signup"; googleEnabled: boolean; error?: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(error ?? null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    if (mode === "signup" && password !== confirm) {
      setFormError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await authApi.login(email, password);
      else await authApi.signup(name, email, password);
      // Full-page navigation (not router.push): guarantees a fresh server
      // render of the protected layout with the new session cookie — immune
      // to Next.js Router Cache / stale RSC redirect loops after login.
      window.location.assign("/chat");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Shell
      title={mode === "login" ? "Welcome back" : "Create your account"}
      subtitle={mode === "login" ? "Sign in to your multi-model AI workspace." : "One account for all your AI models — bring your own keys."}
      footer={
        mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-accent hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError ? (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-[13px] text-danger">
            {formError}
          </div>
        ) : null}
        {mode === "signup" ? (
          <div>
            <Label htmlFor="auth-name">Name</Label>
            <Input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} placeholder="Ada Lovelace" />
          </div>
        ) : null}
        <div>
          <Label htmlFor="auth-email">Email</Label>
          <Input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com" />
        </div>
        <div>
          <Label htmlFor="auth-password">Password</Label>
          <Input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} placeholder="At least 8 characters" />
        </div>
        {mode === "signup" ? (
          <div>
            <Label htmlFor="auth-confirm">Confirm password</Label>
            <Input id="auth-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={8} placeholder="Repeat your password" />
          </div>
        ) : null}
        <Button type="submit" className="w-full" loading={busy} size="lg">
          {mode === "login" ? "Sign in" : "Create account"} <ArrowRight size={16} aria-hidden />
        </Button>
      </form>
      {googleEnabled ? (
        <>
          <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wide text-ink-tertiary">
            <span className="h-px flex-1 bg-surface-border" /> or <span className="h-px flex-1 bg-surface-border" />
          </div>
          <a href="/api/auth/google" className="block">
            <Button type="button" variant="secondary" className="w-full" size="lg">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.1-6.9-5.1H1.3v3C3.3 21.3 7.3 24 12 24z" />
                <path fill="#FBBC05" d="M5.1 14.3c-.3-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3v-3H1.3C.5 8.3 0 10.1 0 12s.5 3.7 1.3 5.3l3.8-3z" />
                <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4L19 2.9C17 1.1 14.7 0 12 0 7.3 0 3.3 2.7 1.3 6.7l3.8 3c.9-3 3.7-5 6.9-5z" />
              </svg>
              Continue with Google
            </Button>
          </a>
        </>
      ) : null}
      {mode === "login" ? (
        <p className="mt-3 text-center">
          <Link href="/forgot-password" className="text-[12.5px] text-ink-tertiary hover:text-accent hover:underline">
            Forgot your password?
          </Link>
        </p>
      ) : null}
      <div className="mt-4 flex justify-center border-t border-surface-border pt-3">
        <InstallAppButton />
      </div>
    </Shell>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Shell
      title="Reset your password"
      subtitle="Enter the email linked to your account."
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <div role="status" className="rounded-lg border border-success/30 bg-success/5 px-3 py-3 text-[13px] leading-relaxed text-ink-secondary">
          If an account exists for <strong className="text-ink-primary">{email}</strong>, a reset link has been issued.
          <p className="mt-1.5 text-[12px] text-ink-tertiary">
            This self-hosted instance has no email delivery configured — the server operator can retrieve the one-time
            link from the server logs (valid 30 minutes). See Help for details.
          </p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await authApi.forgotPassword(email);
              setDone(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Request failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {error ? (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-[13px] text-danger">
              {error}
            </div>
          ) : null}
          <div>
            <Label htmlFor="fp-email">Email</Label>
            <Input id="fp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <Button type="submit" className="w-full" loading={busy} size="lg">
            Send reset link
          </Button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Shell
      title="Choose a new password"
      subtitle={token ? "Enter a new password for your account." : "This link is missing its token — request a new reset link."}
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      {token ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (password !== confirm) {
              setError("Passwords do not match.");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await authApi.resetPassword(token, password);
              router.push("/login");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Reset failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {error ? (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-[13px] text-danger">
              {error}
            </div>
          ) : null}
          <div>
            <Label htmlFor="rp-password">New password</Label>
            <Input id="rp-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="rp-confirm">Confirm password</Label>
            <Input id="rp-confirm" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          <Button type="submit" className="w-full" loading={busy} size="lg">
            Update password
          </Button>
        </form>
      ) : null}
    </Shell>
  );
}

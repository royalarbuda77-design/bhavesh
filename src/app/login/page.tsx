import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { config } from "@/lib/env";
import { AuthCard } from "@/components/auth-card";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect("/chat");
  if (config.authMode === "single") redirect("/chat");
  const { error } = await searchParams;
  const errorMessages: Record<string, string> = {
    google_not_configured: "Google login is not configured on this server.",
    oauth_state: "Sign-in session expired — please try again.",
    google_failed: "Google sign-in failed. Please try again.",
  };
  return (
    <AuthCard
      mode="login"
      googleEnabled={config.google.enabled}
      error={error ? errorMessages[error] ?? null : null}
    />
  );
}

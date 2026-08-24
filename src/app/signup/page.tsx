import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { config } from "@/lib/env";
import { AuthCard } from "@/components/auth-card";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect("/chat");
  if (config.authMode === "single") redirect("/chat");
  return <AuthCard mode="signup" googleEnabled={config.google.enabled} />;
}

import { redirect } from "next/navigation";
import { getSessionUser, getSettings } from "@/lib/auth";
import { config } from "@/lib/env";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const settings = getSettings(user.id);
  return (
    <AppShell
      initialMe={{
        user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
        settings,
        features: {
          googleLogin: config.google.enabled,
          webSearchConfigured: Boolean(config.search.tavilyKey || config.search.serperKey || config.search.braveKey),
          singleUser: config.authMode === "single",
        },
      }}
    >
      {children}
    </AppShell>
  );
}

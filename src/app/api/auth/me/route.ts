import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { getSettings } from "@/lib/auth";
import { config } from "@/lib/env";

export const GET = withAuth(async ({ user }) => {
  const settings = getSettings(user.id);
  return NextResponse.json({
    user,
    settings,
    features: {
      googleLogin: config.google.enabled,
      webSearchConfigured: Boolean(config.search.tavilyKey || config.search.serperKey || config.search.braveKey),
    },
  });
});

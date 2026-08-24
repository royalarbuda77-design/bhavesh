import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/api";
import { PROVIDERS, isProviderId, listCredentials, saveCredential } from "@/lib/providers/manager";
import type { ProviderId } from "@/lib/providers/types";

/** GET /api/providers — the user's connected providers (never returns keys). */
export const GET = withAuth(async ({ user }) => {
  return NextResponse.json({
    providers: listCredentials(user.id),
    catalog: Object.values(PROVIDERS).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      defaultBaseUrl: p.defaultBaseUrl,
      baseUrlRequired: p.baseUrlRequired,
      keyHint: p.keyHint,
      docsUrl: p.docsUrl,
      signupUrl: p.signupUrl,
    })),
  });
});

/** POST /api/providers — connect (save) a provider credential. */
export const POST = withAuth(
  async ({ user, req }) => {
    const body = await readJson<{
      providerId?: string;
      label?: string;
      apiKey?: string;
      baseUrl?: string;
      orgId?: string;
      projectId?: string;
    }>(req);
    const providerId = body.providerId ?? "";
    if (!isProviderId(providerId)) throw new ApiError(400, "invalid_provider", "Unknown provider.");
    const result = saveCredential(user.id, {
      providerId: providerId as ProviderId,
      label: body.label,
      apiKey: body.apiKey ?? "",
      baseUrl: body.baseUrl,
      orgId: body.orgId,
      projectId: body.projectId,
    });
    if (!result.ok) throw new ApiError(400, "invalid_credentials", result.error);
    return NextResponse.json({ ok: true, credentialId: result.credentialId, providers: listCredentials(user.id) }, { status: 201 });
  },
  { rateLimit: "providers" }
);

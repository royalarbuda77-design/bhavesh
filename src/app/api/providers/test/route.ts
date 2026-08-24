import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/api";
import { testCredential } from "@/lib/providers/manager";
import { isProviderId } from "@/lib/providers/registry";
import type { ProviderId } from "@/lib/providers/types";

/**
 * POST /api/providers/test — verify credentials with a minimal server-side
 * request. Works on a draft (pre-save) or a saved credential. The API key is
 * used server-side only and never echoed back.
 */
export const POST = withAuth(
  async ({ user, req }) => {
    const body = await readJson<{
      credentialId?: string;
      providerId?: string;
      apiKey?: string;
      baseUrl?: string;
      modelId?: string;
    }>(req);
    if (body.credentialId) {
      const result = await testCredential(user.id, { credentialId: body.credentialId, modelId: body.modelId });
      return NextResponse.json(result);
    }
    if (!body.providerId || !isProviderId(body.providerId)) throw new ApiError(400, "invalid_provider", "Unknown provider.");
    const result = await testCredential(user.id, {
      providerId: body.providerId as ProviderId,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      modelId: body.modelId,
    });
    return NextResponse.json(result);
  },
  { rateLimit: "providers" }
);

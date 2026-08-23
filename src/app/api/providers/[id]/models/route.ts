import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/api";
import { discoverModels, listModelsForCredential, registerManualModel, getCredentialRow } from "@/lib/providers/manager";

/** GET — models stored for this provider connection. */
export const GET = withAuth(async ({ user, params }) => {
  if (!getCredentialRow(user.id, params.id)) throw new ApiError(404, "not_found", "Provider not found.");
  const models = listModelsForCredential(user.id, params.id);
  return NextResponse.json({ models });
});

/**
 * POST — refresh via live discovery when the provider supports it.
 * Body: { discover: true } for discovery, or { modelId } to register a manual model.
 */
export const POST = withAuth(
  async ({ user, params, req }) => {
    if (!getCredentialRow(user.id, params.id)) throw new ApiError(404, "not_found", "Provider not found.");
    const body = await readJson<{ discover?: boolean; modelId?: string }>(req).catch(
      () => ({ discover: true } as { discover?: boolean; modelId?: string })
    );
    if (body.modelId && !body.discover) {
      const model = registerManualModel(user.id, params.id, body.modelId.trim());
      if (!model) throw new ApiError(404, "not_found", "Provider not found.");
      return NextResponse.json({ ok: true, models: listModelsForCredential(user.id, params.id) });
    }
    const result = await discoverModels(user.id, params.id);
    if (!result.ok) throw new ApiError(502, "discovery_failed", result.error);
    return NextResponse.json({ ok: true, models: result.models });
  },
  { rateLimit: "providers" }
);

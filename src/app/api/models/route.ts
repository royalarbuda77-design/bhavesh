import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/api";
import { listModels, setModelEnabled } from "@/lib/providers/manager";
import { getSettings, updateSettings } from "@/lib/auth";

/** GET /api/models — all models across the user's enabled providers. */
export const GET = withAuth(async ({ user }) => {
  const settings = getSettings(user.id);
  return NextResponse.json({ models: listModels(user.id), defaultModelRef: settings.defaultModelRef });
});

/**
 * POST /api/models — set default model { ref: {credentialId, modelId} | null }
 * or toggle a model { modelRowId, enabled }.
 */
export const POST = withAuth(async ({ user, req }) => {
  const body = await readJson<{ ref?: { credentialId: string; modelId: string } | null; modelRowId?: string; enabled?: boolean }>(req);
  if (body.modelRowId && body.enabled !== undefined) {
    const ok = setModelEnabled(user.id, body.modelRowId, body.enabled);
    if (!ok) throw new ApiError(404, "not_found", "Model not found.");
    return NextResponse.json({ ok: true, models: listModels(user.id) });
  }
  if (body.ref !== undefined) {
    const settings = updateSettings(user.id, { defaultModelRef: body.ref ? JSON.stringify(body.ref) : null });
    return NextResponse.json({ ok: true, defaultModelRef: settings.defaultModelRef });
  }
  throw new ApiError(400, "bad_request", "Nothing to do.");
});

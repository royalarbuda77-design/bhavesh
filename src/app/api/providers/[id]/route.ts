import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/api";
import { deleteCredential, setCredentialEnabled, getCredentialRow, saveCredential } from "@/lib/providers/manager";
import type { ProviderId } from "@/lib/providers/types";

export const PATCH = withAuth(
  async ({ user, params, req }) => {
    const body = await readJson<{ enabled?: boolean; apiKey?: string; baseUrl?: string; orgId?: string; projectId?: string; label?: string }>(req);
    const row = getCredentialRow(user.id, params.id);
    if (!row) throw new ApiError(404, "not_found", "Provider not found.");

    if (body.enabled !== undefined && body.apiKey === undefined) {
      const ok = setCredentialEnabled(user.id, params.id, body.enabled);
      if (!ok) throw new ApiError(404, "not_found", "Provider not found.");
      return NextResponse.json({ ok: true });
    }
    if (body.apiKey !== undefined) {
      const result = saveCredential(user.id, {
        providerId: row.provider_id as ProviderId,
        label: body.label ?? String(row.label),
        apiKey: body.apiKey,
        baseUrl: body.baseUrl ?? (row.base_url ? String(row.base_url) : undefined),
        orgId: body.orgId ?? (row.org_id ? String(row.org_id) : undefined),
        projectId: body.projectId ?? (row.project_id ? String(row.project_id) : undefined),
        existingId: params.id,
      });
      if (!result.ok) throw new ApiError(400, "invalid_credentials", result.error);
      if (body.enabled !== undefined) setCredentialEnabled(user.id, params.id, body.enabled);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true });
  },
  { rateLimit: "providers" }
);

export const DELETE = withAuth(
  async ({ user, params }) => {
    const ok = deleteCredential(user.id, params.id);
    if (!ok) throw new ApiError(404, "not_found", "Provider not found.");
    return NextResponse.json({ ok: true });
  },
  { rateLimit: "providers" }
);

import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/api";
import { executeTool, TOOLS } from "@/lib/tools";

/** GET /api/agent — tool registry (name, description, permission, schema). */
export const GET = withAuth(async () => {
  return NextResponse.json({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      permission: t.permission,
      timeoutMs: t.timeoutMs,
      parameters: t.schema,
    })),
  });
});

/** POST /api/agent — execute a tool directly. Body: { tool, args }. */
export const POST = withAuth(
  async ({ user, req }) => {
    const body = await readJson<{ tool?: string; args?: Record<string, unknown>; conversationId?: string }>(req);
    if (!body.tool) throw new ApiError(400, "missing_tool", "Tool name is required.");
    const result = await executeTool(body.tool, body.args ?? {}, {
      userId: user.id,
      conversationId: body.conversationId ?? null,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  },
  { rateLimit: "search" }
);

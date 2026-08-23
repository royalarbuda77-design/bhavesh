import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/api";
import { webSearch } from "@/lib/search";

/** POST /api/search — direct web search (used for previews; agent uses tools). */
export const POST = withAuth(
  async ({ req }) => {
    const body = await readJson<{ query?: string }>(req);
    const query = (body.query ?? "").trim();
    if (!query) throw new ApiError(400, "empty_query", "Query cannot be empty.");
    const outcome = await webSearch(query, 5);
    return NextResponse.json(outcome);
  },
  { rateLimit: "search" }
);

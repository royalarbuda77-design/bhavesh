import { NextResponse } from "next/server";
import { config } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: config.appName,
    time: new Date().toISOString(),
  });
}

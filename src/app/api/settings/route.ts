import { NextResponse } from "next/server";
import { withAuth, readJson } from "@/lib/api";
import { getSettings, updateSettings, type UserSettings } from "@/lib/auth";

export const GET = withAuth(async ({ user }) => {
  return NextResponse.json({ settings: getSettings(user.id) });
});

export const PATCH = withAuth(async ({ user, req }) => {
  const body = await readJson<Partial<UserSettings>>(req);
  const patch: Partial<UserSettings> = {};
  if (body.theme && ["light", "dark", "system"].includes(body.theme)) patch.theme = body.theme;
  if (typeof body.autoRouting === "boolean") patch.autoRouting = body.autoRouting;
  if (typeof body.fallbackEnabled === "boolean") patch.fallbackEnabled = body.fallbackEnabled;
  if (body.fallbackModelRef !== undefined) patch.fallbackModelRef = body.fallbackModelRef;
  if (typeof body.webSearchDefault === "boolean") patch.webSearchDefault = body.webSearchDefault;
  if (typeof body.sendOnEnter === "boolean") patch.sendOnEnter = body.sendOnEnter;
  if (body.defaultModelRef !== undefined) patch.defaultModelRef = body.defaultModelRef;
  const settings = updateSettings(user.id, patch);
  return NextResponse.json({ settings });
});

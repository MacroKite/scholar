import { NextResponse } from "next/server";
import { buildState } from "@/lib/server/state.js";
import { currentLang, currentUser, jsonError } from "@/lib/server/session.js";

// Everything the signed-in user's app needs, filtered to what they may see.
export async function GET(request) {
  const user = await currentUser();
  if (!user) return jsonError("Please sign in.", 401, request);
  return NextResponse.json({ ...(await buildState(user)), lang: await currentLang() }, { headers: { "Cache-Control": "no-store" } });
}

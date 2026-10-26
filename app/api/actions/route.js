import { NextResponse } from "next/server";
import { ActionError, runAction } from "@/lib/server/actions.js";
import { badRequestOrigin, currentLang, currentUser, jsonError, sessionToken } from "@/lib/server/session.js";

// Every change the app makes: { op, input } → { ok, result }.
export async function POST(request) {
  const bad = badRequestOrigin(request);
  if (bad) return bad;
  const user = await currentUser();
  if (!user) return jsonError("Please sign in.", 401, request);
  const { op, input } = await request.json().catch(() => ({}));
  try {
    const result = await runAction(user, String(op ?? ""), input, { token: await sessionToken(), lang: await currentLang() });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Action errors are already in the user's language.
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: e.status, headers: { "Cache-Control": "no-store" } });
    console.error(`Action ${op} failed:`, e);
    return jsonError("Something went wrong on the server. Try again.", 500, request);
  }
}

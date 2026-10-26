import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, checkLogin, cookieOptions, createSession } from "@/lib/server/auth.js";
import { badRequestOrigin, jsonError } from "@/lib/server/session.js";
import { blocked, clearFailures, recordFailure, throttleKeys } from "@/lib/server/throttle.js";
import { LANG_COOKIE, langOf, translate } from "@/lib/i18n/index.js";

export async function POST(request) {
  const bad = badRequestOrigin(request);
  if (bad) return bad;
  const { username, password } = await request.json().catch(() => ({}));
  if (!username || !password) return jsonError("Enter your username and password.", 400, request);
  const keys = throttleKeys(request, username);
  if (blocked(keys)) return jsonError("Too many attempts. Wait a few minutes and try again.", 429, request);

  const r = await checkLogin(username, password);
  if (r?.pending) return NextResponse.json({ error: translate(langOf(request.cookies.get(LANG_COOKIE)?.value), "This account isn't set up yet. Create it with the activation code from the school office."), pending: true }, { status: 401 });
  if (!r) {
    recordFailure(keys);
    return jsonError("That username and password don't match.", 401, request);
  }
  clearFailures(keys);
  const { token, expires } = await createSession(r.userId);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
  return NextResponse.json({ ok: true });
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, activateAccount, cookieOptions, createSession } from "@/lib/server/auth.js";
import { MIN_PASSWORD } from "@/lib/server/accounts.js";
import { badRequestOrigin, currentSchool, jsonError } from "@/lib/server/session.js";
import { blocked, clearFailures, recordFailure, throttleKeys } from "@/lib/server/throttle.js";

// Create an account: username + one-time code + a new password. Signs in.
export async function POST(request) {
  const bad = badRequestOrigin(request);
  if (bad) return bad;
  const { username, code, password } = await request.json().catch(() => ({}));
  if (!username || !code) return jsonError("Enter your username and activation code.", 400, request);
  if (typeof password !== "string" || password.length < MIN_PASSWORD) return jsonError("Choose a password of at least {n} characters.", 400, request, { n: MIN_PASSWORD });
  if (password.length > 200) return jsonError("That password is too long.", 400, request);
  const school = await currentSchool();
  if (!school) return jsonError("There's no school at this address.", 404, request);
  const keys = throttleKeys(request, username, school.id);
  if (blocked(keys)) return jsonError("Too many attempts. Wait a few minutes and try again.", 429, request);

  const userId = await activateAccount(school.id, username, code, password);
  if (!userId) {
    recordFailure(keys);
    return jsonError("That code doesn't match this username, or it has expired. Ask the school office for a new one.", 400, request);
  }
  clearFailures(keys);
  const { token, expires } = await createSession(school.id, userId);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
  return NextResponse.json({ ok: true });
}

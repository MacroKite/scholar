// Scholar — the signed-in user and language for the current request (pages
// and API routes).

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, userForToken } from "./auth.js";
import { schoolForHost } from "./schools.js";
import { LANG_COOKIE, langOf, translate } from "../i18n/index.js";

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

// The school this request is for (from its address), or null: { id, name, demo }.
export async function currentSchool() {
  return schoolForHost((await headers()).get("host"));
}

// The signed-in user of this school, with their schoolId, or null.
export async function currentUser() {
  const school = await currentSchool();
  return school ? userForToken(await sessionToken(), school.id) : null;
}

// "en" or "bn", from the language switch's cookie.
export async function currentLang() {
  return langOf((await cookies()).get(LANG_COOKIE)?.value);
}
const requestLang = (request) => langOf(request?.cookies?.get(LANG_COOKIE)?.value);

// An error response, in the request's language.
export const jsonError = (error, status, request, params) =>
  NextResponse.json({ error: translate(requestLang(request), error, params) }, { status, headers: { "Cache-Control": "no-store" } });

// Requests that change data must be JSON from this site. Browsers won't send
// a cross-site JSON POST without CORS approval, and the Origin check covers
// the rest.
export function badRequestOrigin(request) {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) return jsonError("Expected JSON.", 415, request);
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return jsonError("Cross-site request refused.", 403, request);
  return null;
}

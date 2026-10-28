import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, endSession } from "@/lib/server/auth.js";
import { badRequestOrigin, currentSchool, sessionToken } from "@/lib/server/session.js";

export async function POST(request) {
  const bad = badRequestOrigin(request);
  if (bad) return bad;
  await endSession(await sessionToken(), (await currentSchool())?.id);
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}

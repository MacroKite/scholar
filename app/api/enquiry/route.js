import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@/lib/server/db.js";
import { badRequestOrigin, jsonError } from "@/lib/server/session.js";
import { blocked, recordFailure, throttleKeys } from "@/lib/server/throttle.js";

// An admission or contact enquiry, or a request for information under the
// Right to Information Act, from the public website. No sign-in, so
// each address may send only a few in a quarter of an hour.
export async function POST(request) {
  const bad = badRequestOrigin(request);
  if (bad) return bad;
  const keys = throttleKeys(request, "enquiry").slice(1).map((k) => `enquiry:${k}`);
  if (blocked(keys)) return jsonError("Too many messages. Wait a few minutes and try again.", 429, request);
  const body = await request.json().catch(() => ({}));
  const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = text(body.name, 80), phone = text(body.phone, 30), className = text(body.className, 40), message = text(body.message, 2000);
  const kind = ["admission", "rti"].includes(body.kind) ? body.kind : "contact";
  if (!name || !phone) return jsonError("Please give your name and phone number.", 400, request);
  if (!/^[+0-9 ()-]{6,}$/.test(phone)) return jsonError("That phone number doesn't look right.", 400, request);
  recordFailure(keys);
  await query(`INSERT INTO enquiries (id, kind, name, phone, class_name, message) VALUES ($1, $2, $3, $4, $5, $6)`,
    [`enq${randomBytes(6).toString("hex")}`, kind, name, phone, className, message]);
  return NextResponse.json({ ok: true });
}

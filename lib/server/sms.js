// Scholar — SMS to guardians through BulkSMSBD (bulksmsbd.net).
// Messages are written to the sms table (the outbox) inside the action's
// transaction, then sent once it has committed. Each school sends through
// its own BulkSMSBD account (school_sms, set with `npm run school -- sms`),
// under its own sender name. A school without one uses the server's
// BULKSMSBD_API_KEY and BULKSMSBD_SENDER_ID, if they're set. With neither,
// nothing leaves the server: messages are kept as "not_sent", so the outbox
// shows what would have gone out.

import { randomBytes } from "node:crypto";
import { query } from "./db.js";

const API = process.env.BULKSMSBD_URL || "https://bulksmsbd.net/api/smsapi";
const shared = () => (process.env.BULKSMSBD_API_KEY && process.env.BULKSMSBD_SENDER_ID ? { key: process.env.BULKSMSBD_API_KEY, sender: process.env.BULKSMSBD_SENDER_ID } : null);

// Inside forSchool(): how this school's SMS go out — "own" (its own
// account), "shared" (the server's) or null (not sent).
export async function smsAccount(q) {
  if (await q.one(`SELECT 1 FROM school_sms`)) return "own";
  return shared() ? "shared" : null;
}

// A Bangladeshi mobile number as the gateway wants it (8801XXXXXXXXX), or null.
export function bdNumber(phone) {
  const d = String(phone ?? "").replace(/[^0-9]/g, "").replace(/^0088/, "88");
  const local = d.startsWith("880") ? d.slice(2) : d.startsWith("0") ? d : d.length === 10 ? `0${d}` : d;
  return /^01[3-9]\d{8}$/.test(local) ? `88${local}` : null;
}
// Bangla needs Unicode SMS: 70 characters a part (67 when split), else 160 (153).
export function smsParts(text) {
  const unicode = /[^\x00-\x7F]/.test(text), n = [...text].length;
  const [one, many] = unicode ? [70, 67] : [160, 153];
  return { unicode, length: n, parts: n <= one ? 1 : Math.ceil(n / many) };
}

// Add messages to the outbox: [{ studentId, phone, kind, ref, body }].
// With a ref, a student gets that kind of message only once per ref.
export async function queueSms(q, list) {
  let queued = 0;
  const configured = !!(await smsAccount(q));
  for (const m of list) {
    if (m.ref && (await q.one(`SELECT 1 FROM sms WHERE kind = $1 AND student_id IS NOT DISTINCT FROM $2 AND ref = $3 LIMIT 1`, [m.kind, m.studentId ?? null, m.ref]))) continue;
    const number = bdNumber(m.phone);
    const status = !number ? "invalid" : configured ? "pending" : "not_sent";
    await q.query(`INSERT INTO sms (id, student_id, phone, kind, ref, body, status, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [`sms${randomBytes(6).toString("hex")}`, m.studentId ?? null, number ?? String(m.phone ?? ""), m.kind, m.ref ?? "", m.body, status, number ? "" : "No valid mobile number"]);
    queued++;
  }
  return queued;
}

// Send what's pending, for every school, each through its own account.
// Messages of one school with the same text go out in one request (the
// gateway takes comma-separated numbers). Runs with full access: it's the
// only code that reads the API keys.
export async function deliverPending() {
  const rows = await query(`SELECT m.id, m.school_id, m.phone, m.body, a.api_key, a.sender_id FROM sms m LEFT JOIN school_sms a ON a.school_id = m.school_id
                            WHERE m.status = 'pending' ORDER BY m.created_at LIMIT 1000`);
  const groups = new Map();
  for (const r of rows) {
    const account = r.api_key ? { key: r.api_key, sender: r.sender_id } : shared();
    if (!account) continue; // its account was removed after the message was queued
    const k = `${r.school_id}
${r.body}`;
    if (!groups.has(k)) groups.set(k, { account, body: r.body, list: [] });
    groups.get(k).list.push(r);
  }
  for (const { account, body, list } of groups.values()) {
    for (let i = 0; i < list.length; i += 100) {
      const batch = list.slice(i, i + 100);
      let ok = false, error = "";
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            api_key: account.key, senderid: account.sender,
            number: batch.map((r) => r.phone).join(","), message: body,
            type: smsParts(body).unicode ? "unicode" : "text",
          }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json().catch(() => ({}));
        ok = res.ok && Number(data.response_code) === 202;
        if (!ok) error = String(data.error_message || data.success_message || `HTTP ${res.status}`).slice(0, 200);
      } catch (e) {
        error = String(e.message || e).slice(0, 200);
      }
      await query(`UPDATE sms SET status = $2, error = $3, sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END WHERE id = ANY($1)`,
        [batch.map((r) => r.id), ok ? "sent" : "failed", error]);
    }
  }
}

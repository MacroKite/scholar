// Scholar — SMS to guardians through BulkSMSBD (bulksmsbd.net).
// Messages are written to the sms table (the outbox) inside the action's
// transaction, then sent once it has committed. Without BULKSMSBD_API_KEY
// and BULKSMSBD_SENDER_ID nothing leaves the server: messages are kept as
// "not_sent", so the outbox shows what would have gone out.

import { randomBytes } from "node:crypto";
import { query } from "./db.js";

const API = process.env.BULKSMSBD_URL || "https://bulksmsbd.net/api/smsapi";
export const smsConfigured = () => !!(process.env.BULKSMSBD_API_KEY && process.env.BULKSMSBD_SENDER_ID);

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
  for (const m of list) {
    if (m.ref && (await q.one(`SELECT 1 FROM sms WHERE kind = $1 AND student_id IS NOT DISTINCT FROM $2 AND ref = $3 LIMIT 1`, [m.kind, m.studentId ?? null, m.ref]))) continue;
    const number = bdNumber(m.phone);
    const status = !number ? "invalid" : smsConfigured() ? "pending" : "not_sent";
    await q.query(`INSERT INTO sms (id, student_id, phone, kind, ref, body, status, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [`sms${randomBytes(6).toString("hex")}`, m.studentId ?? null, number ?? String(m.phone ?? ""), m.kind, m.ref ?? "", m.body, status, number ? "" : "No valid mobile number"]);
    queued++;
  }
  return queued;
}

// Send what's pending. Messages with the same text go out in one request
// (the gateway takes comma-separated numbers).
export async function deliverPending() {
  if (!smsConfigured()) return;
  const rows = await query(`SELECT id, phone, body FROM sms WHERE status = 'pending' ORDER BY created_at LIMIT 1000`);
  const groups = new Map();
  rows.forEach((r) => { (groups.get(r.body) || groups.set(r.body, []).get(r.body)).push(r); });
  for (const [body, list] of groups) {
    for (let i = 0; i < list.length; i += 100) {
      const batch = list.slice(i, i + 100);
      let ok = false, error = "";
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            api_key: process.env.BULKSMSBD_API_KEY, senderid: process.env.BULKSMSBD_SENDER_ID,
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

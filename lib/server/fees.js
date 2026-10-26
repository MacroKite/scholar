// Scholar — fees: charges a student owes and the payments against them.
// A charge's due is its amount, less its discount, less what's been paid
// towards it. A payment gets the next receipt number and is spread over the
// charges it pays, oldest first, so a charge can be paid in parts.

import { randomBytes } from "node:crypto";
import { schoolToday, schoolMonth } from "./clock.js";

export const FEE_KINDS = ["tuition", "admission", "session", "exam", "other"];
export const takaText = (n) => `৳${Math.round(n).toLocaleString("en-IN")}`;
const id = (prefix) => prefix + randomBytes(5).toString("hex");

// This month's tuition for every student at the school (or one student),
// with their standing discount. Safe to run again: one charge per month.
export async function ensureTuition(q, month = schoolMonth(), studentId = null) {
  await q.query(`INSERT INTO charges (id, student_id, kind, label, period, amount, discount, due_on, created_on)
    SELECT 'tu-' || s.id || '-' || $1, s.id, 'tuition', 'Tuition', $1, c.fee, round(c.fee * s.discount / 100.0)::int, $1 || '-10', $2
    FROM students s JOIN classes c ON c.id = s.class_id
    WHERE s.left_on IS NULL ${studentId ? "AND s.id = $3" : ""}
    ON CONFLICT DO NOTHING`, studentId ? [month, schoolToday(), studentId] : [month, schoolToday()]);
}

// A student's charges with something still due, oldest first.
export async function openCharges(q, studentId) {
  const rows = await q.rows(`SELECT c.id, c.kind, c.label, c.period, c.amount, c.discount, c.due_on,
      (c.amount - c.discount - COALESCE((SELECT sum(i.amount) FROM payment_items i WHERE i.charge_id = c.id), 0))::int AS due
    FROM charges c WHERE c.student_id = $1 ORDER BY c.due_on, c.created_on, c.id`, [studentId]);
  return rows.filter((r) => r.due > 0);
}

// Total still due per student: { studentId: amount }.
export async function duesByStudent(q) {
  const rows = await q.rows(`SELECT c.student_id, sum(c.amount - c.discount - COALESCE((SELECT sum(i.amount) FROM payment_items i WHERE i.charge_id = c.id), 0))::int AS due
    FROM charges c JOIN students s ON s.id = c.student_id WHERE s.left_on IS NULL GROUP BY c.student_id`);
  return Object.fromEntries(rows.filter((r) => r.due > 0).map((r) => [r.student_id, r.due]));
}

// Record a payment of `amount` over `charges` (from openCharges), oldest first.
export async function recordPayment(q, { studentId, charges, amount, paidOn, method, note = "", receivedBy = "admin" }) {
  const receiptNo = ((await q.one(`SELECT max(receipt_no)::int AS n FROM payments`)).n || 0) + 1;
  const paymentId = id("pm");
  await q.query(`INSERT INTO payments (id, receipt_no, student_id, paid_on, amount, method, note, received_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [paymentId, receiptNo, studentId, paidOn, amount, method, note, receivedBy]);
  let left = amount;
  for (const c of charges) {
    if (left <= 0) break;
    const part = Math.min(left, c.due);
    await q.query(`INSERT INTO payment_items (payment_id, charge_id, amount) VALUES ($1, $2, $3)`, [paymentId, c.id, part]);
    left -= part;
  }
  return { paymentId, receiptNo };
}

export const newChargeId = () => id("ch");

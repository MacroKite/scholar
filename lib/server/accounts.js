// Scholar — accounts: passwords, activation codes, and who signs in with
// what username.
//   admin              → "admin"
//   teacher tnr        → "tnr"   (the teacher's id)
//   student s113       → "s113"  (the student's id; a family account the
//                                  student and their guardian share)
// New accounts have no password. The school office hands the person a
// one-time activation code; they use it once on /activate to pick a password.

import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "scholar123";
export const MIN_PASSWORD = 8;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password), salt, 32);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  const [kind, salt, key] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = await scrypt(String(password), Buffer.from(salt, "base64"), want.length);
  return timingSafeEqual(got, want);
}

export function usernameFor(role, personId) {
  if (role === "admin") return "admin";
  return String(personId).toLowerCase();
}

export const userRow = (role, personId, passwordHash) => {
  const username = usernameFor(role, personId);
  return { id: `u-${username}`, username, password_hash: passwordHash, role, person_id: role === "admin" ? null : personId };
};

// ---------- activation codes ----------
// 8 characters from an alphabet without look-alikes (no 0/O, 1/I), shown as
// "K7QM-4XPD": about 40 bits, and sign-in attempts are rate limited.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_DAYS = 14;
export function newActivationCode() {
  const s = [...randomBytes(8)].map((b) => CODE_ALPHABET[b % 32]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
export const codeHash = (code) => createHash("sha256").update(String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");

// Give an account a fresh code. Any password it had is removed and its
// sessions end, so this doubles as "reset access" for someone who forgot
// their password. Only the code's hash is stored: it's shown once.
export async function issueCode(q, userId) {
  const code = newActivationCode();
  const expires = new Date(Date.now() + CODE_DAYS * 86400000).toISOString();
  await q.query(`UPDATE users SET password_hash = NULL, invite_hash = $2, invite_expires = $3 WHERE id = $1`, [userId, codeHash(code), expires]);
  await q.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  return { code, expires };
}

async function addAccount(q, role, personId) {
  const u = userRow(role, personId, null);
  await q.query("INSERT INTO users (id, username, role, person_id) VALUES ($1, $2, $3, $4)", [u.id, u.username, u.role, u.person_id]);
  return { role, personId, username: u.username, ...(await issueCode(q, u.id)) };
}
// The family account for a newly added student (shared with their guardian).
export const addFamilyAccounts = async (q, studentId) => [await addAccount(q, "student", studentId)];
export const addTeacherAccount = (q, teacherId) => addAccount(q, "teacher", teacherId);
// A new school's admin account (`npm run school -- create`).
export const addAdminAccount = (q) => addAccount(q, "admin", null);

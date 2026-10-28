// Scholar — sessions.
// A session is a random token kept in an httpOnly cookie. The database only
// stores its SHA-256, so a leaked sessions table can't be used to log in.

import { randomBytes, createHash } from "node:crypto";
import { forSchool } from "./db.js";
import { codeHash, hashPassword, verifyPassword } from "./accounts.js";

export const SESSION_COOKIE = "scholar_session";
export const SESSION_DAYS = 30;

export const tokenHash = (token) => createHash("sha256").update(token).digest("hex");

// A session belongs to one school: its cookie only works at that school's
// address, because every lookup runs inside forSchool().
export async function createSession(schoolId, userId) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await forSchool(schoolId, async (q) => {
    await q.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [tokenHash(token), userId, expires.toISOString()]);
    // Housekeeping: drop expired sessions now and then.
    if (Math.random() < 0.05) await q.query("DELETE FROM sessions WHERE expires_at < now()");
  });
  return { token, expires };
}

export async function userForToken(token, schoolId) {
  if (!token || !schoolId) return null;
  const u = await forSchool(schoolId, (q) => q.one(
    `SELECT u.id, u.username, u.role, u.person_id AS "personId", u.prefs
       FROM sessions s JOIN users u ON u.school_id = s.school_id AND u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)],
  ));
  return u && { ...u, schoolId };
}

export async function endSession(token, schoolId) {
  if (token && schoolId) await forSchool(schoolId, (q) => q.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]));
}

const NO_USER_HASH = ["scrypt", Buffer.alloc(16).toString("base64"), Buffer.alloc(32).toString("base64")].join("$");

// Checks a username and password at one school: { userId } when they match, { pending }
// for an account that hasn't been activated yet, otherwise null. Always runs
// one scrypt so an unknown username takes as long as a wrong password.
export async function checkLogin(schoolId, username, password) {
  const u = await forSchool(schoolId, (q) => q.one("SELECT id, password_hash FROM users WHERE username = lower($1)", [String(username || "").trim()]));
  const ok = await verifyPassword(password, u?.password_hash || NO_USER_HASH);
  if (ok && u) return { userId: u.id };
  if (u && !u.password_hash) return { pending: true };
  return null;
}

// First sign-in: a valid, unexpired code sets the account's password.
// Returns the user id, or null if the code doesn't match.
export async function activateAccount(schoolId, username, code, password) {
  const hash = await hashPassword(password);
  const u = await forSchool(schoolId, (q) => q.one(
    `UPDATE users SET password_hash = $3, invite_hash = NULL, invite_expires = NULL
      WHERE username = lower($1) AND invite_hash = $2 AND invite_expires > now()
      RETURNING id`,
    [String(username || "").trim(), codeHash(code), hash],
  ));
  return u?.id ?? null;
}

export const cookieOptions = (expires) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  ...(expires ? { expires } : {}),
});

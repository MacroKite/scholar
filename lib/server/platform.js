// Scholar — running the service: creating schools and looking after them.
// Used by `npm run school` (scripts/school.mjs), never by the app itself:
// it works with full access across every school.

import { tx, query, one, asSchool } from "./db.js";
import { addAdminAccount, issueCode } from "./accounts.js";
import { schoolToday } from "./clock.js";
import { DEFAULT_GRADING } from "../school/calendar.js";
import { DEFAULT_SCHEDULE } from "../school/rules.js";

export class PlatformError extends Error {}
const need = (ok, message) => { if (!ok) throw new PlatformError(message); };

export const SCHOOL_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ROOT = (process.env.ROOT_DOMAIN || "localhost").toLowerCase();
const cleanHost = (h) => String(h ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
const isHost = (h) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) || h === "localhost";

// The address a school opens at: its first own address, or <id>.<ROOT_DOMAIN>.
export const addressOf = (s) => s.hosts?.[0] ?? `${s.id}.${ROOT}`;

async function hostFree(h, except = null) {
  const taken = await one(`SELECT id FROM schools WHERE $1 = ANY(hosts) AND id IS DISTINCT FROM $2`, [h, except]);
  need(!taken, `${h} is already an address of ${taken?.id}.`);
}

// A new, empty school with one admin account. Returns the admin's one-time
// activation code: they open <address>/activate, enter "admin" and the code,
// and choose a password. Classes, teachers and students are added in the app.
export async function createSchool({ id, name, adminName, adminEmail = "", hosts = [], year = schoolToday().slice(0, 4) }) {
  id = String(id ?? "").trim().toLowerCase();
  name = String(name ?? "").trim();
  adminName = String(adminName ?? "").trim();
  hosts = [...new Set(hosts.map(cleanHost).filter(Boolean))];
  need(SCHOOL_ID.test(id), "The school id is 1–40 lowercase letters, digits and hyphens, e.g. adarsha-high. It becomes the address <id>." + ROOT + ".");
  need(name, "Give the school's name (--name).");
  need(adminName, "Give the admin's name (--admin), usually the principal.");
  need(/^\d{4}$/.test(year), "The academic year is four digits, e.g. 2026.");
  need(!(await one(`SELECT 1 FROM schools WHERE id = $1`, [id])), `There's already a school with the id ${id}.`);
  for (const h of hosts) { need(isHost(h), `${h} isn't a web address.`); await hostFree(h); }
  return tx(async (q) => {
    await q.query(`INSERT INTO schools (id, name, hosts) VALUES ($1, $2, $3)`, [id, name, hosts]);
    return asSchool(q, id, async (q) => {
      await q.query(`INSERT INTO settings (school, year, threshold, admin_name, admin_email, grading, schedule, seeded_on) VALUES ($1, $2, 75, $3, $4, $5, $6, $7)`,
        [name, year, adminName, String(adminEmail).trim(), JSON.stringify(DEFAULT_GRADING), JSON.stringify(DEFAULT_SCHEDULE), schoolToday()]);
      const account = await addAdminAccount(q);
      return { id, name, hosts, address: addressOf({ id, hosts }), ...account };
    });
  });
}

export async function listSchools() {
  return query(`SELECT s.id, s.name, s.hosts, s.status, s.demo, to_char(s.created_at, 'YYYY-MM-DD') AS created,
      (SELECT count(*) FROM students x WHERE x.school_id = s.id AND x.left_on IS NULL)::int AS students,
      (SELECT count(*) FROM teachers x WHERE x.school_id = s.id)::int AS teachers,
      (SELECT count(*) FROM users x WHERE x.school_id = s.id AND x.password_hash IS NOT NULL)::int AS active_accounts,
      (SELECT max(x.created_at) FROM sessions x WHERE x.school_id = s.id) AS last_sign_in,
      (SELECT sender_id FROM school_sms x WHERE x.school_id = s.id) AS sms_sender
    FROM schools s ORDER BY s.created_at`);
}

async function getSchool(id) {
  const s = await one(`SELECT id, name, hosts, status, demo FROM schools WHERE id = $1`, [String(id ?? "").trim().toLowerCase()]);
  need(s, `There's no school with the id ${id}.`);
  return s;
}

// Suspended: its website and app show "not found" and nobody can sign in.
// Nothing is deleted; activating it brings everything back.
export async function setStatus(id, status) {
  const s = await getSchool(id);
  need(["active", "suspended"].includes(status), "The status is active or suspended.");
  await query(`UPDATE schools SET status = $2 WHERE id = $1`, [s.id, status]);
  if (status === "suspended") await query(`DELETE FROM sessions WHERE school_id = $1`, [s.id]);
}

export async function addHost(id, host) {
  const s = await getSchool(id), h = cleanHost(host);
  need(isHost(h), `${host} isn't a web address.`);
  await hostFree(h, s.id);
  await query(`UPDATE schools SET hosts = array_append(hosts, $2) WHERE id = $1 AND NOT ($2 = ANY(hosts))`, [s.id, h]);
}
export async function removeHost(id, host) {
  const s = await getSchool(id), h = cleanHost(host);
  need(s.hosts.includes(h), `${h} isn't an address of ${s.id}.`);
  await query(`UPDATE schools SET hosts = array_remove(hosts, $2) WHERE id = $1`, [s.id, h]);
}

// The school's own BulkSMSBD account (or none: then it uses the server's, if any).
export async function setSms(id, { key, sender } = {}) {
  const s = await getSchool(id);
  if (!key && !sender) { await query(`DELETE FROM school_sms WHERE school_id = $1`, [s.id]); return; }
  need(String(key ?? "").trim() && String(sender ?? "").trim(), "Give both the API key (--key) and the sender ID (--sender).");
  await query(`INSERT INTO school_sms (school_id, api_key, sender_id) VALUES ($1, $2, $3)
               ON CONFLICT (school_id) DO UPDATE SET api_key = EXCLUDED.api_key, sender_id = EXCLUDED.sender_id, updated_at = now()`, [s.id, key.trim(), sender.trim()]);
}

// A new one-time code for the school's admin: how a principal who forgot
// their password, or a new principal, gets in. The old password stops working.
export async function newAdminCode(id) {
  const s = await getSchool(id);
  return tx((q) => asSchool(q, s.id, async (q) => {
    const u = await q.one(`SELECT id, username FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`);
    need(u, `${s.id} has no admin account.`);
    return { username: u.username, address: addressOf(s), ...(await issueCode(q, u.id)) };
  }));
}

// Deletes the school and every row of its data, for good.
export async function deleteSchool(id) {
  const s = await getSchool(id);
  await query(`DELETE FROM schools WHERE id = $1`, [s.id]);
  return s;
}

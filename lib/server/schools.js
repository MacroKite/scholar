// Scholar — which school a request is for, from the address it came to.
//   1. a school's own addresses (schools.hosts), e.g. www.adarshahigh.edu.bd;
//   2. <school id>.<ROOT_DOMAIN>, e.g. adarsha.scholar.com.bd, or
//      adarsha.localhost:5180 in development (ROOT_DOMAIN defaults to
//      localhost);
//   3. otherwise DEFAULT_SCHOOL, or the only school if there's just one, so
//      a single-school deployment works at any address.
// A suspended school, or an address that matches none, has no school.

import { query } from "./db.js";

const ROOT = (process.env.ROOT_DOMAIN || "localhost").toLowerCase();

// Looked up at most once a minute per address: every page and API call asks.
const TTL = 60 * 1000;
const cache = new Map();

export async function schoolForHost(host) {
  const h = String(host ?? "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const hit = cache.get(h);
  if (hit && Date.now() - hit.at < TTL) return hit.school;
  const school = await lookup(h);
  if (cache.size > 1000) cache.clear();
  cache.set(h, { at: Date.now(), school });
  return school;
}

async function lookup(h) {
  const rows = await query(`SELECT id, name, hosts, status, demo FROM schools`);
  const sub = h.endsWith(`.${ROOT}`) ? h.slice(0, -ROOT.length - 1) : null;
  let found = rows.find((s) => s.hosts.includes(h));
  // A school's own subdomain that doesn't exist is no school, not the default.
  if (!found && sub) found = rows.find((s) => s.id === sub);
  else if (!found) found = rows.find((s) => s.id === process.env.DEFAULT_SCHOOL) ?? (rows.length === 1 ? rows[0] : null);
  return found?.status === "active" ? { id: found.id, name: found.name, demo: found.demo } : null;
}

// After creating, changing or suspending a school.
export const forgetSchools = () => cache.clear();

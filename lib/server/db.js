// Scholar — database connection.
// With DATABASE_URL set (Neon, Vercel Postgres, a local server…) this talks to
// Postgres through `pg`. Without it, local development falls back to PGlite:
// a real Postgres compiled to WebAssembly that keeps its files in .data/pglite.

import { mkdirSync } from "node:fs";
import pg from "pg";
import { SCHEMA, SECURITY, APP_ROLE } from "./schema.js";
import { upgradeLegacy } from "./migrate.js";
import { createDemoSchool, DEMO_SCHOOL } from "./seed-db.js";

// The connection is cached on globalThis so dev hot reloads don't open a
// second one. The tables are checked again whenever the schema changes, so a
// running `next dev` picks up new tables after an edit to schema.js.
const g = globalThis;

export function db() {
  // (__scholarDb: the connection cached by earlier versions of this file.)
  g.__scholarConn ||= g.__scholarDb || connect().catch((e) => { g.__scholarConn = null; throw e; });
  if (g.__scholarSchema !== SCHEMA) {
    g.__scholarSchema = SCHEMA;
    g.__scholarReady = g.__scholarConn.then(async (conn) => { await prepare(conn); return conn; })
      .catch((e) => { g.__scholarSchema = null; throw e; });
  }
  return g.__scholarReady;
}

async function connect() {
  return process.env.DATABASE_URL ? openPostgres(process.env.DATABASE_URL) : openPglite();
}

function openPostgres(url) {
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX) || 5 });
  return {
    query: (text, params) => pool.query(text, params),
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const out = await fn(runner((t, p) => c.query(t, p), (t) => c.query(t)));
        await c.query("COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    end: () => pool.end(),
  };
}

async function openPglite() {
  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set. Add a Postgres connection string in the Vercel project settings.");
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR || ".data/pglite";
  mkdirSync(dir, { recursive: true });
  const lite = new PGlite(dir);
  await lite.waitReady;
  return {
    query: (text, params) => lite.query(text, params),
    tx: (fn) => lite.transaction((t) => fn(runner((x, p) => t.query(x, p), (x) => t.exec(x)))),
    end: () => lite.close(),
  };
}

// Inside a transaction: q.query() gives the raw result, q.rows() its rows,
// q.one() the first row (or null) and q.exec() runs several statements.
function runner(run, exec) {
  return { query: run, exec, rows: async (t, p) => (await run(t, p)).rows, one: async (t, p) => (await run(t, p)).rows[0] ?? null };
}

// Create the tables (upgrading an old single-school database first), turn on
// row-level security, and give an empty database the demo school. The
// advisory lock stops two cold-started servers from doing it at once.
async function prepare(conn) {
  await conn.tx(async (q) => {
    await q.query("SELECT pg_advisory_xact_lock(7240531)");
    const legacy = await upgradeLegacy(q);
    if (!legacy) await q.exec(SCHEMA);
    await q.exec(SECURITY);
    if (!(await q.one("SELECT count(*)::int AS n FROM schools")).n) await createDemoSchool(q, DEMO_SCHOOL);
  });
}

// ---------- the connecting user: every school ----------
// These see every school's rows. Use them only for the schools table,
// upgrades and background work (sending SMS); school data goes through
// forSchool(), where row-level security keeps each school to itself.
export async function query(text, params) { return (await (await db()).query(text, params)).rows; }
export async function one(text, params) { return (await query(text, params))[0] ?? null; }
export async function tx(fn) { return (await db()).tx(fn); }

// ---------- one school ----------
// Runs fn(q) in a transaction that can only see and change one school's rows:
// app.school_id picks the school (and fills in school_id on new rows), and
// the app role can't get round the row-level security policies.
export async function forSchool(schoolId, fn) {
  if (!schoolId) throw new Error("forSchool() needs a school.");
  return tx((q) => asSchool(q, schoolId, fn));
}
// The same inside a transaction that's already open (e.g. while preparing the
// database); afterwards the transaction is back to the connecting user.
export async function asSchool(q, schoolId, fn) {
  await q.query("SELECT set_config('app.school_id', $1, true)", [schoolId]);
  await q.query(`SET LOCAL ROLE ${APP_ROLE}`);
  const out = await fn(q);
  await q.query("RESET ROLE");
  await q.query("SELECT set_config('app.school_id', '', true)");
  return out;
}

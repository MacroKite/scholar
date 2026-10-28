// Scholar — upgrading a database from before Scholar held many schools.
// Such a database has one school's data in tables without a school_id, and a
// one-row settings table keyed by id = 1. It becomes the first school:
//   1. the old schema is brought fully up to date (schema-legacy.js);
//   2. the old tables move aside into a "legacy" schema;
//   3. the new tables are created and every row is copied across, tagged
//      with the school;
//   4. the old tables are dropped.
// It all runs in the transaction that prepares the database, so a failure
// leaves the old database as it was.

import { LEGACY_SCHEMA } from "./schema-legacy.js";
import { SCHEMA, SCHOOL_TABLES } from "./schema.js";

// The old database's school gets this id (and so, later, this address:
// <id>.<ROOT_DOMAIN>). Pick it before upgrading with LEGACY_SCHOOL_ID.
const LEGACY_SCHOOL_ID = process.env.LEGACY_SCHOOL_ID || "main";

const columnsOf = async (q, schema, table) =>
  (await q.rows(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [schema, table])).map((r) => r.column_name);

// Returns true if it upgraded an old database (the new tables then exist).
export async function upgradeLegacy(q) {
  const old = await q.one(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'settings' AND column_name = 'id'`);
  if (!old) return false;

  await q.exec(LEGACY_SCHEMA);
  const here = (await q.one(`SELECT current_schema() AS s`)).s;
  await q.exec(`CREATE SCHEMA legacy`);
  for (const t of [...SCHOOL_TABLES, "fees"]) await q.exec(`ALTER TABLE ${t} SET SCHEMA legacy`);
  await q.exec(SCHEMA);

  const st = await q.one(`SELECT school FROM legacy.settings`);
  if (st) {
    await q.query(`INSERT INTO schools (id, name) VALUES ($1, $2)`, [LEGACY_SCHOOL_ID, st.school]);
    for (const t of SCHOOL_TABLES) {
      const wanted = new Set(await columnsOf(q, here, t));
      const cols = (await columnsOf(q, "legacy", t)).filter((c) => wanted.has(c) && c !== "school_id").map((c) => `"${c}"`).join(", ");
      await q.query(`INSERT INTO ${t} (school_id, ${cols}) SELECT $1, ${cols} FROM legacy.${t}`, [LEGACY_SCHOOL_ID]);
    }
  }
  await q.exec(`DROP SCHEMA legacy CASCADE`);
  console.log(st ? `Upgraded the database to hold many schools: its data is now school "${LEGACY_SCHOOL_ID}".` : "Upgraded the database to hold many schools.");
  return true;
}

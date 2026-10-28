// Scholar — database commands.
//   npm run db:setup   create the tables; add the demo school if the database is empty
//   npm run db:reset   delete every school and start again with just the demo school
// Uses DATABASE_URL (from the environment or .env.local), or the local PGlite
// database when it isn't set. Stop `npm run dev` first when using PGlite.

import "./env.mjs";

const { db, tx, query } = await import("../lib/server/db.js");
const { createDemoSchool, DEMO_SCHOOL } = await import("../lib/server/seed-db.js");
const { DEMO_PASSWORD } = await import("../lib/server/accounts.js");

const cmd = process.argv[2];
if (!["setup", "reset"].includes(cmd)) { console.error("Usage: node scripts/db.mjs setup|reset"); process.exit(1); }

const conn = await db(); // creates the tables and adds the demo school to an empty database
if (cmd === "reset") {
  await tx(async (q) => {
    await q.query(`DELETE FROM schools`); // every school's data goes with it (ON DELETE CASCADE)
    await createDemoSchool(q, DEMO_SCHOOL);
  });
}

// Counted as the connecting user, so across every school.
const schools = await query(`SELECT s.id, s.name, s.demo, s.status,
    (SELECT count(*) FROM students x WHERE x.school_id = s.id)::int AS students,
    (SELECT count(*) FROM teachers x WHERE x.school_id = s.id)::int AS teachers,
    (SELECT count(*) FROM users x WHERE x.school_id = s.id)::int AS users,
    (SELECT demo FROM settings x WHERE x.school_id = s.id) AS personas
  FROM schools s ORDER BY s.created_at`);
console.log(`${process.env.DATABASE_URL ? "Postgres" : `PGlite (${process.env.PGLITE_DIR || ".data/pglite"})`}: ${schools.length} school${schools.length === 1 ? "" : "s"}.`);
for (const s of schools) {
  console.log(`  ${s.id}: ${s.name}${s.demo ? " (demo)" : ""}${s.status !== "active" ? ` [${s.status}]` : ""} · ${s.students} students, ${s.teachers} teachers, ${s.users} accounts`);
  if (s.demo && s.personas?.student) console.log(`    Demo logins (password "${DEMO_PASSWORD}" unless changed): admin · ${s.personas.teacher} · ${s.personas.student}`);
}
await conn.end();

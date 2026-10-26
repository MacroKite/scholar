// Scholar — database commands.
//   npm run db:setup   create the tables; seed the demo school if the database is empty
//   npm run db:reset   wipe everything and seed the demo school again
// Uses DATABASE_URL (from the environment or .env.local), or the local PGlite
// database when it isn't set. Stop `npm run dev` first when using PGlite.

import { existsSync, readFileSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const { db, tx, one } = await import("../lib/server/db.js");
const { seedDatabase } = await import("../lib/server/seed-db.js");
const { DEMO_PASSWORD } = await import("../lib/server/accounts.js");

const cmd = process.argv[2];
if (!["setup", "reset"].includes(cmd)) { console.error("Usage: node scripts/db.mjs setup|reset"); process.exit(1); }

const conn = await db(); // creates the tables and seeds an empty database
if (cmd === "reset") await tx((q) => seedDatabase(q));

const counts = await one(`SELECT (SELECT count(*) FROM students)::int AS students, (SELECT count(*) FROM teachers)::int AS teachers,
  (SELECT count(*) FROM users)::int AS users, (SELECT demo FROM settings) AS demo`);
console.log(`${process.env.DATABASE_URL ? "Postgres" : `PGlite (${process.env.PGLITE_DIR || ".data/pglite"})`}: ${counts.students} students, ${counts.teachers} teachers, ${counts.users} accounts.`);
if (counts.demo?.student) {
  const n = counts.demo.student.slice(1);
  console.log(`Demo logins (password "${DEMO_PASSWORD}" unless changed): admin · ${counts.demo.teacher} · s${n}`);
}
await conn.end();

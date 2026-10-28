// Scholar — proof that schools can't see or change each other's data.
//   npm test
// Builds a fresh database (PGlite, in a temporary folder) with two schools
// made from the same demo data, so both have an "admin", a student s113 and
// a receipt no. 1. Every name in the second school is marked "ZZ". Then, as
// the first school's admin, a teacher and a family it:
//   - loads each one's app data and checks no "ZZ" appears;
//   - runs the actions that write, on ids both schools share;
//   - checks the second school's rows are byte-for-byte unchanged;
// and checks row-level security directly, sign-in and sessions, and which
// school each web address opens.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "scholar-test-"));
process.env.PGLITE_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.DEFAULT_SCHOOL;
delete process.env.ROOT_DOMAIN;

const { db, tx, query, forSchool, asSchool } = await import("../lib/server/db.js");
const { SCHOOL_TABLES } = await import("../lib/server/schema.js");
const { createDemoSchool, DEMO_SCHOOL } = await import("../lib/server/seed-db.js");
const { checkLogin, createSession, userForToken } = await import("../lib/server/auth.js");
const { buildState } = await import("../lib/server/state.js");
const { runAction, ActionError } = await import("../lib/server/actions.js");
const { schoolForHost, forgetSchools } = await import("../lib/server/schools.js");
const { DEMO_PASSWORD } = await import("../lib/server/accounts.js");
const { schoolToday } = await import("../lib/server/clock.js");

const A = DEMO_SCHOOL, B = "second", MARK = "ZZ";
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split("\n").join("\n       ")}`); process.exitCode = 1; }
}

const conn = await db(); // creates the tables and the demo school (A)
try {
  console.log("Setting up two schools…");
  await tx(async (q) => {
    await createDemoSchool(q, B, { name: "Second School" });
    await asSchool(q, B, async (q) => {
      await q.query(`UPDATE settings SET school = '${MARK} Second School', admin_name = '${MARK} ' || admin_name`);
      await q.query(`UPDATE students SET name = '${MARK} ' || name, guardian = '${MARK} ' || guardian`);
      await q.query(`UPDATE teachers SET name = '${MARK} ' || name`);
      await q.query(`UPDATE notices SET topic = '${MARK} ' || topic`);
      await q.query(`INSERT INTO enquiries (id, kind, name, phone) VALUES ('enq-zz', 'contact', '${MARK} Parent', '01700000000')`);
    });
  });

  // Every row of school B, so any change to it shows.
  const fingerprint = async () => Object.fromEntries(await Promise.all(SCHOOL_TABLES.map(async (t) =>
    [t, (await query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM ${t} x WHERE school_id = $1`, [B]))[0]])));
  const before = await fingerprint();
  const counts = async (school) => (await query(`SELECT (SELECT count(*) FROM students WHERE school_id = $1 AND left_on IS NULL)::int AS students, (SELECT count(*) FROM payments WHERE school_id = $1)::int AS payments`, [school]))[0];

  // Sign in as A's admin, teacher and family, as the app does.
  const personas = (await forSchool(A, (q) => q.one(`SELECT demo FROM settings`))).demo;
  const signIn = async (school, username) => {
    const r = await checkLogin(school, username, DEMO_PASSWORD);
    assert.ok(r?.userId, `${username} can sign in at ${school}`);
    const { token } = await createSession(school, r.userId);
    return { token, user: await userForToken(token, school) };
  };
  const admin = await signIn(A, "admin"), teacher = await signIn(A, personas.teacher), family = await signIn(A, personas.student);

  console.log("\nReading");
  for (const [who, s] of [["admin", admin], ["teacher", teacher], ["family", family]]) {
    await check(`${who}'s app data has nothing from the other school`, async () => {
      const json = JSON.stringify(await buildState(s.user));
      assert.ok(!json.includes(MARK), `found "${MARK}" in the ${who}'s data`);
    });
  }
  await check("admin sees exactly their own school's students and receipts", async () => {
    const st = await buildState(admin.user), own = await counts(A);
    assert.equal(st.students.length, own.students);
    assert.equal(st.payments.length, own.payments);
  });

  console.log("\nRow-level security");
  await check("every table shows only the school's own rows", () => forSchool(A, async (q) => {
    for (const t of SCHOOL_TABLES) {
      const r = await q.one(`SELECT count(*)::int AS other, (SELECT count(*)::int FROM ${t}) AS mine FROM ${t} WHERE school_id <> $1`, [A]);
      assert.equal(r.other, 0, `${t} shows another school's rows`);
    }
    assert.deepEqual((await q.rows(`SELECT id FROM schools`)).map((s) => s.id), [A]);
  }));
  await check("another school's rows can't be changed or deleted", () => forSchool(A, async (q) => {
    assert.equal((await q.query(`UPDATE students SET name = 'hacked' WHERE school_id = $1`, [B])).affectedRows ?? 0, 0);
    assert.equal((await q.query(`DELETE FROM payments WHERE school_id = $1`, [B])).affectedRows ?? 0, 0);
  }));
  await check("a row can't be written into another school", async () => {
    await assert.rejects(forSchool(A, (q) => q.query(`INSERT INTO notices (school_id, id, number, date, topic, body) VALUES ($1, 'n-x', '1', '2026-01-01', 'x', 'x')`, [B])), /row-level security/);
    await assert.rejects(forSchool(A, (q) => q.query(`UPDATE students SET school_id = $1 WHERE id = $2`, [B, personas.student])), /row-level security|violates/);
  });
  // Not tested, because it isn't true: SQL running inside forSchool() could
  // RESET ROLE or set another app.school_id. Row-level security guards
  // against mistakes in our queries, not against someone running SQL of
  // their own; every query passes values as parameters ($1), so nobody can.
  await check("a hosted database's owner (not a superuser) can switch to the app role", async () => {
    // Like Neon or Supabase: the app connects as a user that may create roles
    // but isn't a superuser. Set the tables up as that user, twice, and switch.
    const { PGlite } = await import("@electric-sql/pglite");
    const { SCHEMA, SECURITY } = await import("../lib/server/schema.js");
    const pg = new PGlite();
    try {
      await pg.exec(`CREATE ROLE hosted_owner LOGIN CREATEROLE; GRANT CREATE ON SCHEMA public TO hosted_owner; SET SESSION AUTHORIZATION hosted_owner;`);
      for (let i = 0; i < 2; i++) { await pg.exec(SCHEMA); await pg.exec(SECURITY); }
      await pg.transaction(async (t) => {
        await t.query(`SET LOCAL ROLE scholar_app`);
        assert.equal((await t.query(`SELECT current_user AS u`)).rows[0].u, "scholar_app");
        assert.equal((await t.query(`SELECT count(*)::int AS n FROM students`)).rows[0].n, 0);
      });
    } finally { await pg.close(); }
  });
  await check("with no school set, nothing is visible", () => tx(async (q) => {
    await q.query(`SET LOCAL ROLE scholar_app`);
    assert.equal((await q.one(`SELECT count(*)::int AS n FROM students`)).n, 0);
    assert.equal((await q.one(`SELECT count(*)::int AS n FROM users`)).n, 0);
  }));

  console.log("\nSigning in");
  await check("a username signs in only at its own school", async () => {
    const changed = await forSchool(B, (q) => q.query(`UPDATE users SET username = 'only-b' WHERE username = 'admin'`));
    assert.equal(changed.affectedRows ?? changed.rowCount, 1);
    assert.equal(await checkLogin(A, "only-b", DEMO_PASSWORD), null);
    assert.ok((await checkLogin(B, "only-b", DEMO_PASSWORD))?.userId);
    await forSchool(B, (q) => q.query(`UPDATE users SET username = 'admin' WHERE username = 'only-b'`));
  });
  await check("a session from one school doesn't work at another", async () => {
    assert.equal(await userForToken(admin.token, B), null);
    assert.equal((await userForToken(admin.token, A))?.username, "admin");
  });

  console.log("\nWriting (as the first school, on ids both schools have)");
  const st = await buildState(admin.user);
  const today = schoolToday();
  const sid = personas.student;
  const stu = st.students.find((s) => s.id === sid);
  const cls = st.classes.find((c) => c.id === stu.classId);
  const schoolDay = Object.keys(st.attendance).map((k) => k.split("|")[0]).sort().at(-1);
  const exam = st.exams.find((e) => e.classId === cls.id && e.date <= today && e.parts.length === 0) ?? st.exams.find((e) => e.classId === cls.id && e.date <= today);
  const charge = st.charges.find((c) => c.studentId === sid && c.amount - c.discount - c.paid > 0);
  const receipt = st.payments.find((p) => p.studentId === sid);
  const term = st.exams[0].term;
  const ct = st.classTeachers[`${cls.id}|${stu.section}`];
  const ops = [
    ["profile.update", { name: "New Principal" }],
    ["school.update", { school: "Renamed School", year: st.settings.year, threshold: 70 }],
    ["student.save", { id: sid, name: "Renamed Student", guardian: "G", gender: stu.gender ?? "Male", classId: cls.id, section: stu.section, religion: "islam" }],
    ["student.save", { name: "New Student", guardian: "G", gender: "Female", classId: cls.id, section: stu.section, religion: "islam" }],
    ["teacher.save", { name: "New Teacher", subject: "Mathematics" }],
    ["attendance.save", { date: schoolDay, classId: cls.id, section: stu.section, marks: { [sid]: "A" } }],
    ["marks.save", { examId: exam.id, section: stu.section, marks: { [sid]: exam.parts.length ? Object.fromEntries(exam.parts.map((p) => [p.key, 1])) : 1 } }],
    ["fee.charge", { kind: "other", label: "Picnic", amount: 100, dueOn: today }],
    ...(charge ? [["fee.collect", { studentId: sid, paidOn: today, method: "Cash", amount: 1, chargeIds: [charge.id] }]] : []),
    ...(receipt ? [["fee.void", { paymentId: receipt.id }]] : []),
    ["notice.create", { topic: "Holiday", body: "No school.", audience: "Everyone", sms: true }],
    ["sms.send", { body: "Hello" }],
    ["results.publish", { term, on: true }],
    ["classTeacher.set", { classId: cls.id, sections: [stu.section], teacherId: ct }],
    ["timetable.clear", { id: st.timetable[0].id }],
    ["enquiry.delete", { id: "enq-zz" }],
    ["account.reset", { key: `s:${sid}` }],
    ["demo.reset", {}],
  ];
  for (const [op, input] of ops) {
    await check(op, async () => {
      try { await runAction(admin.user, op, input); }
      catch (e) { throw e instanceof ActionError ? new Error(`refused: ${e.message}`) : e; }
    });
  }
  await check("…and the second school is exactly as it was", async () => {
    const after = await fingerprint();
    const changed = SCHOOL_TABLES.filter((t) => JSON.stringify(after[t]) !== JSON.stringify(before[t]));
    assert.deepEqual(changed, [], `changed in the second school: ${changed.join(", ")}`);
  });
  await check("a school that isn't a demo can't be reset", async () => {
    await tx((q) => q.query(`UPDATE schools SET demo = false WHERE id = $1`, [B]));
    const bAdmin = await signIn(B, "admin");
    await assert.rejects(runAction(bAdmin.user, "demo.reset", {}), (e) => e instanceof ActionError && e.status === 403);
  });

  console.log("\nFees by bKash / Nagad");
  const refused = (p, status) => assert.rejects(p, (e) => e instanceof ActionError && (!status || e.status === status));
  const due = async () => (await buildState(family.user)).charges.reduce((a, c) => a + Math.max(0, c.amount - c.discount - c.paid), 0);
  await check("the admin sets the school's numbers; a wrong number is refused", async () => {
    await refused(runAction(admin.user, "payments.setup", { bkash: "12345" }));
    await runAction(admin.user, "payments.setup", { bkash: "+8801711-223344", nagad: "", rocket: "", note: "Use Payment" });
    assert.equal((await buildState(family.user)).payNumbers.bkash, "01711223344");
  });
  let claimId;
  await check("a family's claim is checked: wallet, amount, transaction ID", async () => {
    const owed = await due();
    assert.ok(owed > 0, "the family owes something");
    await refused(runAction(family.user, "fee.claim", { method: "nagad", amount: 100, trxId: "9KD7XH2PQ1" }));          // the school has no Nagad
    await refused(runAction(family.user, "fee.claim", { method: "bkash", amount: owed + 1, trxId: "9KD7XH2PQ1" }));    // more than is due
    await refused(runAction(family.user, "fee.claim", { method: "bkash", amount: 100, trxId: "12" }));                 // not a transaction ID
    claimId = (await runAction(family.user, "fee.claim", { method: "bkash", amount: 100, trxId: "9kd7-xh2pq1", sender: "01811000222" })).id;
    await refused(runAction(family.user, "fee.claim", { method: "bkash", amount: 100, trxId: "9KD7XH2PQ1" }));         // the same transaction ID twice
    await refused(runAction(family.user, "fee.claim", { method: "bkash", amount: owed - 99, trxId: "ZZ99YY88XX" }));   // more than is left once the waiting one counts
    const mine = (await buildState(family.user)).claims;
    assert.equal(mine.length, 1);
    assert.deepEqual([mine[0].status, mine[0].trxId], ["pending", "9KD7XH2PQ1"]);
  });
  await check("only the office can approve, and nothing counts until it does", async () => {
    const before = await due();
    await refused(runAction(family.user, "fee.claimDecide", { id: claimId, approve: true }), 403);
    assert.equal(await due(), before);
    const r = await runAction(admin.user, "fee.claimDecide", { id: claimId, approve: true });
    assert.equal(await due(), before - 100);
    const st = await buildState(family.user);
    const pay = st.payments.find((p) => p.receiptNo === r.receiptNo);
    assert.ok(pay, "the family sees the receipt");
    assert.deepEqual([pay.amount, pay.method, pay.receivedBy], [100, "bKash", "online"]);
    assert.match(pay.note, /TrxID 9KD7XH2PQ1/);
    assert.equal(st.claims[0].status, "approved");
    await refused(runAction(admin.user, "fee.claimDecide", { id: claimId, approve: true }), 409);  // not twice
  });
  await check("a rejected claim tells the family why, and makes no receipt", async () => {
    const id = (await runAction(family.user, "fee.claim", { method: "bkash", amount: 50, trxId: "AB12CD34EF" })).id;
    const receipts = (await buildState(family.user)).payments.length;
    await refused(runAction(admin.user, "fee.claimDecide", { id, approve: false, reason: "" }));
    await runAction(admin.user, "fee.claimDecide", { id, approve: false, reason: "Not in our statement" });
    const st = await buildState(family.user);
    const c = st.claims.find((x) => x.id === id);
    assert.deepEqual([c.status, c.reason], ["rejected", "Not in our statement"]);
    assert.equal(st.payments.length, receipts);
    // A rejected transaction ID can be sent again (e.g. after a typo was fixed).
    const again = (await runAction(family.user, "fee.claim", { method: "bkash", amount: 50, trxId: "AB12CD34EF" })).id;
    await runAction(family.user, "fee.claimCancel", { id: again });
    assert.equal((await buildState(family.user)).claims.find((x) => x.id === again).status, "cancelled");
  });
  await check("the other school never sees these claims", async () => {
    assert.equal((await forSchool(B, (q) => q.rows(`SELECT 1 FROM payment_claims`))).length, 0);
  });

  console.log("\nRunning the service");
  const P = await import("../lib/server/platform.js");
  const { deliverPending, smsAccount } = await import("../lib/server/sms.js");
  const { activateAccount } = await import("../lib/server/auth.js");
  let fresh;
  await check("a new school starts empty, with just an admin who can activate", async () => {
    fresh = await P.createSchool({ id: "fresh", name: "Fresh School", adminName: "New Principal", hosts: ["www.fresh.edu.bd"] });
    const uid = await activateAccount("fresh", "admin", fresh.code, "fresh-password");
    assert.ok(uid, "the code works once");
    assert.equal(await activateAccount("fresh", "admin", fresh.code, "again-password"), null, "and only once");
    const st = await buildState(await userForToken((await createSession("fresh", uid)).token, "fresh"));
    assert.equal(st.settings.school, "Fresh School");
    assert.deepEqual([st.students.length, st.teachers.length, st.classes.length, st.payments.length, st.notices.length], [0, 0, 0, 0, 0]);
    assert.equal(st.isDemo, false);
  });
  await check("a school id or address can't be taken twice", async () => {
    await assert.rejects(P.createSchool({ id: "fresh", name: "x", adminName: "y" }), P.PlatformError);
    await assert.rejects(P.createSchool({ id: "other", name: "x", adminName: "y", hosts: ["www.fresh.edu.bd"] }), P.PlatformError);
    await assert.rejects(P.addHost(B, "www.fresh.edu.bd"), P.PlatformError);
  });
  await check("online payment works only in a demo school", async () => {
    const r = await checkLogin(B, personas.student, DEMO_PASSWORD);
    const fam = await userForToken((await createSession(B, r.userId)).token, B); // B is no longer a demo (above)
    await assert.rejects(runAction(fam, "fee.pay", { method: "bKash" }), (e) => e instanceof ActionError && e.status === 403);
    const demoFam = family.user;
    const owed = (await buildState(demoFam)).charges.some((c) => c.amount - c.discount - c.paid > 0);
    if (owed) await runAction(demoFam, "fee.pay", { method: "bKash" });
  });
  await check("the app can see that a school has an SMS account, never its API key", async () => {
    await P.setSms("fresh", { key: "SECRET-KEY-123", sender: "FRESH" });
    assert.equal(await forSchool("fresh", smsAccount), "own");
    assert.equal(await forSchool(A, smsAccount), null, "another school isn't affected");
    await assert.rejects(forSchool("fresh", (q) => q.one(`SELECT api_key FROM school_sms`)), /permission denied/);
    await assert.rejects(forSchool("fresh", (q) => q.one(`SELECT * FROM school_sms`)), /permission denied/);
    assert.equal((await forSchool(A, (q) => q.rows(`SELECT sender_id FROM school_sms`))).length, 0, "nor another school's sender name");
  });
  await check("each school's SMS go out through its own account", async () => {
    const sent = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { sent.push(Object.fromEntries(new URLSearchParams(init.body))); return new Response(JSON.stringify({ response_code: 202 }), { status: 200 }); };
    try {
      process.env.BULKSMSBD_API_KEY = "SHARED-KEY"; process.env.BULKSMSBD_SENDER_ID = "SCHOLAR";
      const { queueSms } = await import("../lib/server/sms.js");
      await forSchool("fresh", (q) => queueSms(q, [{ phone: "01711000111", kind: "custom", body: "From fresh" }]));
      await forSchool(A, (q) => queueSms(q, [{ phone: "01711000222", kind: "custom", body: "From demo" }]));
      await deliverPending();
      const by = Object.fromEntries(sent.map((m) => [m.message, m]));
      assert.equal(by["From fresh"]?.api_key, "SECRET-KEY-123");
      assert.equal(by["From fresh"]?.senderid, "FRESH");
      assert.equal(by["From demo"]?.api_key, "SHARED-KEY", "a school without its own account uses the shared one");
      assert.equal(by["From demo"]?.senderid, "SCHOLAR");
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.BULKSMSBD_API_KEY; delete process.env.BULKSMSBD_SENDER_ID;
    }
  });
  await check("deleting a school removes every row of it, and nothing else", async () => {
    const otherBefore = await fingerprint();
    await P.deleteSchool("fresh");
    for (const t of [...SCHOOL_TABLES, "school_sms"]) assert.equal((await query(`SELECT count(*)::int AS n FROM ${t} WHERE school_id = 'fresh'`))[0].n, 0, `${t} still has rows`);
    assert.deepEqual(await fingerprint(), otherBefore);
  });

  console.log("\nWeb addresses");
  forgetSchools();
  await check("each address opens the right school", async () => {
    assert.equal((await schoolForHost("localhost:5180"))?.id, A);
    assert.equal((await schoolForHost("demo.localhost:5180"))?.id, A);
    assert.equal((await schoolForHost("second.localhost"))?.id, B);
    assert.equal(await schoolForHost("nobody.localhost"), null, "a subdomain that isn't a school");
    assert.equal(await schoolForHost("unknown.example.com"), null, "an unknown address, with two schools and no default");
  });
  await check("a suspended school doesn't open", async () => {
    await tx((q) => q.query(`UPDATE schools SET status = 'suspended' WHERE id = $1`, [B]));
    forgetSchools();
    assert.equal(await schoolForHost("second.localhost"), null);
  });
} finally {
  await conn.end();
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}.`);

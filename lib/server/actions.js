// Scholar — every change the app can make, keyed by name. The browser posts
// { op, input } to /api/actions; each handler checks the signed-in user may do
// it, validates the input and writes inside one transaction.

import { randomBytes } from "node:crypto";
import { tx } from "./db.js";
import { schoolToday, schoolMonth } from "./clock.js";
import { seedDatabase } from "./seed-db.js";
import { tokenHash } from "./auth.js";
import { MIN_PASSWORD, hashPassword, verifyPassword, addFamilyAccounts, addTeacherAccount, issueCode } from "./accounts.js";
import { CLASS_NAMES, PAYMENT_METHODS, AUDIENCES, isIsoDate, isSchoolDay } from "../school/calendar.js";
import { GROUPS, RELIGIONS, PART_KEYS, scheduleOf, scheduleProblem, shiftById, shiftOfSection, periodsOverlap, defaultRule, takesSubject, optionalChoices, canShareSlot, partsProblem, partsTotal } from "../school/rules.js";
import { FEATURES } from "../school/features.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { makeT } from "../i18n/index.js";

export class ActionError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
// Messages are written in English and shown in the user's language: the
// request's language is kept for the length of the action.
const langStore = new AsyncLocalStorage();
const tr = () => makeT(langStore.getStore() ?? "en");
const T = (key, params) => tr()(key, params);
const D = (text) => tr().data(text); // school data: class and subject names
const weekday = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(tr().locale, { weekday: "long" });
const fail = (message, status = 400) => { throw new ActionError(T(message), status); };
const need = (ok, message, status = 400) => { if (!ok) fail(message, status); };
const only = (user, ...roles) => need(roles.includes(user.role), "You don't have permission to do that.", 403);
const text = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const newId = (prefix) => prefix + randomBytes(5).toString("hex");


// ---------- lookups (q is the transaction) ----------
const getClass = (q, id) => q.one(`SELECT * FROM classes WHERE id = $1`, [id]);
const getStudent = (q, id) => q.one(`SELECT * FROM students WHERE id = $1`, [id]);
const getTeacher = (q, id) => q.one(`SELECT * FROM teachers WHERE id = $1`, [id]);
const sectionLabel = (c, sec) => `${D(c.name)} · ${sec}`;
// Rows in the shape lib/school/rules.js works with.
const clsOf = (c) => ({ ...c, sectionMeta: c.section_meta || {}, subjectRules: c.subject_rules || {} });
const stuOf = (s) => ({ section: s.section, religion: s.religion, optional: s.optional_subject });
const loadSchedule = async (q) => scheduleOf((await q.one(`SELECT schedule FROM settings WHERE id = 1`)).schedule);
const schoolDay = async (q, date) => isSchoolDay(date, (await loadSchedule(q)).days);
// A section's time for a period ([start, end]), or null if it has no such period.
const spanOf = (schedule, c, section, period) => shiftOfSection(schedule, clsOf(c), section).periods[period] ?? null;
// Timetable periods that fall outside the school week and shifts.
async function dropStrayPeriods(q, schedule) {
  const rows = await q.rows(`SELECT t.id, t.day, t.period, t.section, c.section_meta FROM timetable t JOIN classes c ON c.id = t.class_id`);
  const gone = rows.filter((r) => !schedule.days.includes(r.day) || !spanOf(schedule, r, r.section, r.period)).map((r) => r.id);
  if (gone.length) await q.query(`DELETE FROM timetable WHERE id = ANY($1)`, [gone]);
  return gone.length;
}
// Students whose 4th subject is no longer open to their section lose it.
async function dropStrayOptionals(q, classId) {
  const c = clsOf(await getClass(q, classId));
  for (const sec of c.sections) {
    await q.query(`UPDATE students SET optional_subject = NULL WHERE class_id = $1 AND section = $2 AND optional_subject IS NOT NULL AND NOT (optional_subject = ANY($3))`, [c.id, sec, optionalChoices(c, sec)]);
  }
}
// Does this teacher have periods in that section (for that subject)?
async function teaches(q, teacherId, classId, section, subject) {
  return !!(await q.one(`SELECT 1 FROM timetable WHERE teacher_id = $1 AND class_id = $2 AND section = $3 ${subject ? "AND subject = $4" : ""} LIMIT 1`,
    subject ? [teacherId, classId, section, subject] : [teacherId, classId, section]));
}
async function classAndSection(q, classId, section) {
  const c = await getClass(q, classId);
  need(c, "That class doesn't exist.");
  need(c.sections.includes(section), T("{name} has no section {section}.", { name: D(c.name), section }));
  return c;
}
const nextRoll = async (q, classId, section, except = null) =>
  ((await q.one(`SELECT max(roll)::int AS r FROM students WHERE class_id = $1 AND section = $2 AND id IS DISTINCT FROM $3`, [classId, section, except])).r || 0) + 1;
const nextNoticeNumber = async (q) => String(Number((await q.one(`SELECT max(number::bigint)::text AS n FROM notices WHERE number ~ '^[0-9]+$'`)).n ?? 0) + 1);
// Rows touched by an UPDATE/DELETE (pg calls it rowCount, PGlite affectedRows).
const changed = (r) => r.rowCount ?? r.affectedRows ?? 0;

function checkGrades(ranges) {
  need(Array.isArray(ranges) && ranges.length, "Add at least one grade.");
  need(ranges.length <= 20, "That's too many grades.");
  const rows = ranges.map((r) => ({ start: Number(r.start), end: Number(r.end), grade: text(r.grade, 8), point: r.point === "" || r.point == null ? "" : Number(r.point) }));
  for (const r of rows) {
    need(r.grade && Number.isFinite(r.start) && Number.isFinite(r.end), "Every row needs a start, an end and a grade.");
    need(r.start >= 0 && r.end <= 100 && r.start <= r.end, T("{grade}: the range {start}–{end} isn't valid.", { grade: r.grade, start: r.start, end: r.end }));
    need(r.point === "" || (Number.isFinite(r.point) && r.point >= 0 && r.point <= 10), T("{grade}: the point isn't valid.", { grade: r.grade }));
  }
  const sorted = [...rows].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) need(sorted[i].start > sorted[i - 1].end, T("{a} and {b} overlap.", { a: sorted[i - 1].grade, b: sorted[i].grade }));
  need(new Set(rows.map((r) => r.grade)).size === rows.length, "Two rows use the same grade.");
  return rows.sort((a, b) => b.start - a.start);
}

// ======================================================================
const ACTIONS = {
  // ---------- account ----------
  // Small per-user UI memory: read notifications, open nav groups.
  "prefs.update": async (q, user, input) => {
    const patch = {};
    if (Array.isArray(input.readNotifs)) patch.readNotifs = input.readNotifs.filter((x) => typeof x === "string").slice(-300).map((x) => x.slice(0, 120));
    if (input.navOpen && typeof input.navOpen === "object") patch.navOpen = Object.fromEntries(Object.entries(input.navOpen).slice(0, 20).map(([k, v]) => [k, !!v]));
    await q.query(`UPDATE users SET prefs = prefs || $2::jsonb WHERE id = $1`, [user.id, JSON.stringify(patch)]);
  },

  "password.change": async (q, user, input, ctx) => {
    const u = await q.one(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
    need(await verifyPassword(String(input.current ?? ""), u.password_hash), "Your current password isn't right.");
    const next = String(input.next ?? "");
    need(next.length >= MIN_PASSWORD, T("Use at least {n} characters.", { n: MIN_PASSWORD }));
    need(next.length <= 200, "That password is too long.");
    await q.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [user.id, await hashPassword(next)]);
    // Sign out everywhere else.
    await q.query(`DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, [user.id, tokenHash(ctx.token)]);
  },

  // ---------- settings (admin) ----------
  "profile.update": async (q, user, input) => {
    only(user, "admin");
    const name = text(input.name, 80);
    need(name, "Add your name.");
    await q.query(`UPDATE settings SET admin_name = $1 WHERE id = 1`, [name]);
  },
  "school.update": async (q, user, input) => {
    only(user, "admin");
    const school = text(input.school, 120), year = text(input.year, 9);
    const threshold = Math.max(1, Math.min(100, Math.round(Number(input.threshold)) || 75));
    await q.query(`UPDATE settings SET school = COALESCE(NULLIF($1, ''), school), year = COALESCE(NULLIF($2, ''), year), threshold = $3 WHERE id = 1`, [school, year, threshold]);
  },
  // Turn an optional feature on or off for the whole school.
  "features.update": async (q, user, input) => {
    only(user, "admin");
    need(Object.hasOwn(FEATURES, input.key ?? ""), "That feature doesn't exist.");
    await q.query(`UPDATE settings SET features = features || jsonb_build_object($1::text, $2::boolean) WHERE id = 1`, [input.key, !!input.on]);
  },
  "demo.reset": async (q, user) => {
    only(user, "admin");
    // Keep everyone signed in: accounts are recreated with the same ids.
    const sessions = await q.rows(`SELECT token_hash, user_id, expires_at FROM sessions`);
    await seedDatabase(q);
    for (const s of sessions) {
      await q.query(`INSERT INTO sessions (token_hash, user_id, expires_at) SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM users WHERE id = $2)`, [s.token_hash, s.user_id, s.expires_at]);
    }
  },

  // ---------- classes & grading (admin) ----------
  "class.save": async (q, user, input) => {
    only(user, "admin");
    const short = text(input.short, 20), year = text(input.year, 9);
    const uniq = (list, max) => [...new Set((Array.isArray(list) ? list : []).map((x) => text(x, max)).filter(Boolean))];
    const sections = uniq(input.sections, 12), subjects = uniq(input.subjects, 60);
    const fee = Math.max(0, Math.round(Number(input.fee)) || 0);
    need(CLASS_NAMES.includes(short), "Pick a class.");
    need(/^\d{4}$/.test(year), "Pick an academic year.");
    need(sections.length, "Add at least one section.");
    need(subjects.length, "Add at least one subject.");
    need(sections.length <= 12 && subjects.length <= 30, "That's too many sections or subjects.");
    const name = `Class ${short}`, level = CLASS_NAMES.indexOf(short) - 2;
    const c = input.id ? await getClass(q, input.id) : null;
    need(!input.id || c, "That class no longer exists.", 404);
    need(!(await q.one(`SELECT 1 FROM classes WHERE name = $1 AND year = $2 AND id IS DISTINCT FROM $3`, [name, year, c?.id ?? null])), T("{name} already exists for {year}. Edit it from All Classes instead.", { name: D(name), year }));
    if (c) {
      const removed = c.sections.filter((s) => !sections.includes(s));
      if (removed.length) {
        need(!(await q.one(`SELECT 1 FROM students WHERE class_id = $1 AND section = ANY($2) LIMIT 1`, [c.id, removed])), "A section you removed still has students. Move them first.");
        await q.query(`DELETE FROM class_teachers WHERE class_id = $1 AND section = ANY($2)`, [c.id, removed]);
      }
      // Subjects keep their rules; new Class 9–10 subjects get the usual SSC ones.
      const rules = Object.fromEntries(subjects.map((sub) => [sub, c.subject_rules?.[sub] ?? defaultRule(level, sub)]).filter(([, r]) => r));
      const meta = Object.fromEntries(sections.filter((sec) => c.section_meta?.[sec]).map((sec) => [sec, c.section_meta[sec]]));
      await q.query(`UPDATE classes SET name = $2, short = $3, level = $4, year = $5, sections = $6, subjects = $7, fee = $8, subject_rules = $9, section_meta = $10 WHERE id = $1`, [c.id, name, short, level, year, JSON.stringify(sections), JSON.stringify(subjects), fee, JSON.stringify(rules), JSON.stringify(meta)]);
      await dropStrayOptionals(q, c.id);
    } else {
      const rules = Object.fromEntries(subjects.map((sub) => [sub, defaultRule(level, sub)]).filter(([, r]) => r));
      await q.query(`INSERT INTO classes (id, name, short, level, year, sections, subjects, fee, subject_rules) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [newId("c"), name, short, level, year, JSON.stringify(sections), JSON.stringify(subjects), fee, JSON.stringify(rules)]);
    }
    return { name, sections: sections.length };
  },
  // A section's shift, and (Classes 9–10) its group.
  "section.set": async (q, user, input) => {
    only(user, "admin");
    const c = await classAndSection(q, input.classId, input.section);
    const meta = { ...(c.section_meta || {}) }, cur = { ...(meta[input.section] || {}) };
    let removed = 0;
    if ("shift" in input) {
      const schedule = await loadSchedule(q);
      need(schedule.shifts.some((x) => x.id === input.shift), "Pick a shift.");
      cur.shift = input.shift;
    }
    if ("group" in input) {
      need(!input.group || GROUPS.includes(input.group), "Pick a group.");
      if (input.group) cur.group = input.group; else delete cur.group;
    }
    meta[input.section] = cur;
    await q.query(`UPDATE classes SET section_meta = $2 WHERE id = $1`, [c.id, JSON.stringify(meta)]);
    // A shift with fewer periods drops the section's later ones.
    if ("shift" in input) removed = await dropStrayPeriods(q, await loadSchedule(q));
    if ("group" in input) await dropStrayOptionals(q, c.id);
    return { removed };
  },
  // Who takes each subject of a class, and how its exams are split.
  "class.rules": async (q, user, input) => {
    only(user, "admin");
    const c = await getClass(q, input.classId);
    need(c, "That class doesn't exist.", 404);
    const raw = input.rules && typeof input.rules === "object" ? input.rules : {};
    const rules = {};
    for (const sub of c.subjects) {
      const r = raw[sub];
      if (!r || typeof r !== "object") continue;
      const groups = Array.isArray(r.groups) ? GROUPS.filter((g) => r.groups.includes(g)) : [];
      const religion = RELIGIONS.includes(r.religion) ? r.religion : null;
      const optional = !!r.optional;
      need(!(religion && optional), T("{subject} can't be both a religion subject and a 4th subject.", { subject: D(sub) }));
      const parts = Array.isArray(r.parts) ? r.parts.filter((x) => x && PART_KEYS.includes(x.key) && Number(x.full) > 0).map((x) => ({ key: x.key, full: Math.round(Number(x.full)) })) : [];
      const problem = parts.length ? partsProblem(parts, partsTotal(parts)) : "";
      need(!problem, `${D(sub)}: ${T(problem)}`);
      const rule = { ...(groups.length && groups.length < GROUPS.length ? { groups } : {}), ...(religion ? { religion } : {}), ...(optional ? { optional } : {}), ...(parts.length ? { parts } : {}) };
      if (Object.keys(rule).length) rules[sub] = rule;
    }
    await q.query(`UPDATE classes SET subject_rules = $2 WHERE id = $1`, [c.id, JSON.stringify(rules)]);
    await dropStrayOptionals(q, c.id);
  },
  // The school week and shifts. Periods that no longer exist leave the timetable.
  "schedule.save": async (q, user, input) => {
    only(user, "admin");
    const days = Array.isArray(input.days) ? [...new Set(input.days.map(Number))].sort((a, b) => a - b) : [];
    const num = (v) => (v === "" || v == null ? NaN : Number(v));
    const shifts = (Array.isArray(input.shifts) ? input.shifts : []).slice(0, 3).map((x) => ({
      id: String(x?.id ?? ""), name: text(x?.name, 40), start: text(x?.start, 5),
      length: num(x?.length), gap: num(x?.gap), count: num(x?.count), breakAfter: num(x?.breakAfter), breakLength: num(x?.breakLength),
    }));
    const problem = scheduleProblem({ days, shifts });
    need(!problem, problem);
    await q.query(`UPDATE settings SET schedule = $1 WHERE id = 1`, [JSON.stringify({ days, shifts })]);
    return { removed: await dropStrayPeriods(q, scheduleOf({ days, shifts })) };
  },
  // Set (or clear, with no teacherId) the class teacher of one or more
  // sections of a class: one section, or every section at once.
  "classTeacher.set": async (q, user, input) => {
    only(user, "admin");
    const c = await getClass(q, input.classId);
    need(c, "That class doesn't exist.", 404);
    const sections = Array.isArray(input.sections) ? [...new Set(input.sections.map(String))] : [];
    need(sections.length && sections.every((s) => c.sections.includes(s)), T("{name} doesn't have that section.", { name: D(c.name) }));
    if (!input.teacherId) {
      await q.query(`DELETE FROM class_teachers WHERE class_id = $1 AND section = ANY($2)`, [c.id, sections]);
      return { teacher: null };
    }
    const t = await getTeacher(q, input.teacherId);
    need(t, "Pick a teacher.");
    for (const s of sections) {
      await q.query(`INSERT INTO class_teachers (class_id, section, teacher_id) VALUES ($1, $2, $3)
                     ON CONFLICT (class_id, section) DO UPDATE SET teacher_id = EXCLUDED.teacher_id`, [c.id, s, t.id]);
    }
    return { teacher: t.name };
  },
  "class.delete": async (q, user, input) => {
    only(user, "admin");
    const c = await getClass(q, input.id);
    need(c, "That class no longer exists.", 404);
    const n = (await q.one(`SELECT count(*)::int AS n FROM students WHERE class_id = $1`, [c.id])).n;
    need(!n, T("{name} still has {n} students. Move or remove them first.", { name: D(c.name), n }));
    await q.query(`DELETE FROM classes WHERE id = $1`, [c.id]);
  },
  "grading.save": async (q, user, input) => {
    only(user, "admin");
    need(["gpa5", "gpa4", "letter", "custom"].includes(input.scale), "Pick a scale.");
    const ranges = checkGrades(input.ranges);
    await q.query(`UPDATE settings SET grading = $1 WHERE id = 1`, [JSON.stringify({ scale: input.scale, ranges })]);
  },

  // ---------- timetable (admin) ----------
  // Set a period of a section, or (with id) change one subject in it.
  // Religion classes and 4th subjects can share a period; anything else
  // already in it is replaced.
  "timetable.save": async (q, user, input) => {
    only(user, "admin");
    const schedule = await loadSchedule(q);
    const day = Number(input.day), period = Number(input.period), section = String(input.section ?? "");
    const c = await classAndSection(q, input.classId, section);
    const span = Number.isInteger(period) ? spanOf(schedule, c, section, period) : null;
    need(schedule.days.includes(day) && span, "That period doesn't exist.");
    need(c.subjects.includes(input.subject), T("{name} doesn't have {subject}.", { name: D(c.name), subject: D(input.subject) }));
    const t = await getTeacher(q, input.teacherId);
    need(t, "Pick a teacher.");
    const id = input.id ? String(input.id) : null;
    if (id) need(await q.one(`SELECT 1 FROM timetable WHERE id = $1 AND class_id = $2 AND section = $3 AND day = $4 AND period = $5`, [id, c.id, section, day, period]), "That period has changed. Reload and try again.", 409);
    const here = await q.rows(`SELECT id, subject FROM timetable WHERE class_id = $1 AND section = $2 AND day = $3 AND period = $4 AND id IS DISTINCT FROM $5`, [c.id, section, day, period, id]);
    const replaced = here.filter((x) => !canShareSlot(clsOf(c), x.subject, input.subject)).map((x) => x.id);
    // The teacher can't be anywhere else at that time, in either shift.
    const theirs = await q.rows(`SELECT t.id, t.period, t.class_id, t.section, c.section_meta FROM timetable t JOIN classes c ON c.id = t.class_id
                                 WHERE t.teacher_id = $1 AND t.day = $2 AND NOT (t.id = ANY($3))`, [t.id, day, [id ?? "", ...replaced]]);
    const clash = theirs.find((x) => { const other = spanOf(schedule, x, x.section, x.period); return other && periodsOverlap(other, span); });
    if (clash) fail(T("{name} is already teaching {class} this period.", { name: t.name, class: sectionLabel(await getClass(q, clash.class_id), clash.section) }));
    if (replaced.length) await q.query(`DELETE FROM timetable WHERE id = ANY($1)`, [replaced]);
    if (id) await q.query(`UPDATE timetable SET subject = $2, teacher_id = $3, room = $4 WHERE id = $1`, [id, input.subject, t.id, text(input.room, 20)]);
    else await q.query(`INSERT INTO timetable (id, day, period, class_id, section, subject, teacher_id, room) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [newId("tt"), day, period, c.id, section, input.subject, t.id, text(input.room, 20)]);
  },
  "timetable.clear": async (q, user, input) => {
    only(user, "admin");
    await q.query(`DELETE FROM timetable WHERE id = $1`, [input.id]);
  },

  // ---------- exams & results ----------
  "exam.save": async (q, user, input) => {
    only(user, "admin", "teacher");
    const term = text(input.term, 80), date = input.date, start = text(input.start, 5);
    const fullMarks = Math.round(Number(input.fullMarks));
    need(term, "Give the exam a name.");
    need(isIsoDate(date), "Pick a date.");
    need(await schoolDay(q, date), T("{day} isn't a school day.", { day: weekday(date) }));
    need(/^([01]\d|2[0-3]):[0-5]\d$/.test(start), "Pick a start time.");
    need(fullMarks >= 1 && fullMarks <= 1000, "Full marks must be between 1 and 1000.");
    // Parts (CQ, MCQ, practical): blank parts are left out.
    const parts = Array.isArray(input.parts) ? input.parts.filter((x) => x && x.full !== "" && x.full != null).map((x) => ({ key: x.key, full: Math.round(Number(x.full)) })) : [];
    const problem = partsProblem(parts, fullMarks);
    need(!problem, problem);
    const c = await getClass(q, input.classId);
    need(c, "Pick a class.");
    need(c.subjects.includes(input.subject), T("{name} doesn't have {subject}.", { name: D(c.name), subject: D(input.subject) }));
    if (user.role === "teacher") {
      need(!input.id, "Only the school office can change an exam.", 403);
      need(await q.one(`SELECT 1 FROM timetable WHERE teacher_id = $1 AND class_id = $2 AND subject = $3 LIMIT 1`, [user.personId, c.id, input.subject]), "You can only set exams for subjects you teach.", 403);
    }
    if (input.id) {
      const e = await q.one(`SELECT parts FROM exams WHERE id = $1`, [input.id]);
      need(e, "That exam no longer exists.", 404);
      if (JSON.stringify(e.parts) !== JSON.stringify(parts)) need(!(await q.one(`SELECT 1 FROM marks WHERE exam_id = $1 LIMIT 1`, [input.id])), "Marks are already in, so the parts can't change.");
      await q.query(`UPDATE exams SET term = $2, subject = $3, class_id = $4, date = $5, start = $6, full_marks = $7, parts = $8 WHERE id = $1`, [input.id, term, input.subject, c.id, date, start, fullMarks, JSON.stringify(parts)]);
    } else {
      await q.query(`INSERT INTO exams (id, term, subject, class_id, date, start, full_marks, parts) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [newId("e"), term, input.subject, c.id, date, start, fullMarks, JSON.stringify(parts)]);
    }
  },
  "exam.delete": async (q, user, input) => {
    only(user, "admin");
    await q.query(`DELETE FROM exams WHERE id = $1`, [input.id]);
  },
  "marks.save": async (q, user, input) => {
    only(user, "admin", "teacher");
    const e = await q.one(`SELECT * FROM exams WHERE id = $1`, [input.examId]);
    need(e, "That exam no longer exists.", 404);
    need(e.date <= schoolToday(), "This exam hasn't happened yet.");
    const section = String(input.section ?? "");
    if (user.role === "teacher") need(await teaches(q, user.personId, e.class_id, section, e.subject), "You don't teach this subject in that section.", 403);
    // Only students who take the subject (their group, religion, 4th subject).
    const c = clsOf(await getClass(q, e.class_id));
    const studs = new Map((await q.rows(`SELECT id, name, section, religion, optional_subject FROM students WHERE class_id = $1 AND section = $2`, [e.class_id, section]))
      .filter((s) => takesSubject(stuOf(s), c, e.subject)).map((s) => [s.id, s]));
    const entries = Object.entries(input.marks && typeof input.marks === "object" ? input.marks : {});
    const blank = (v) => v === null || v === undefined || v === "";
    const mark = (v, full) => {
      const n = Number(v);
      need(Number.isFinite(n) && n >= 0 && n <= full, T("Marks must be between 0 and {full}.", { full }));
      return Math.round(n * 2) / 2;
    };
    for (const [sid, v] of entries) {
      need(studs.has(sid), "Some of those students don't take this subject in this section.");
      // An exam in parts takes { cq: 52, mcq: 21 }; all parts empty means absent.
      const got = e.parts.length && v && typeof v === "object" ? v : null;
      if (e.parts.length ? !got || e.parts.every((x) => blank(got[x.key])) : blank(v)) { await q.query(`DELETE FROM marks WHERE exam_id = $1 AND student_id = $2`, [e.id, sid]); continue; }
      let value, parts = null;
      if (e.parts.length) {
        need(e.parts.every((x) => !blank(got[x.key])), T("Enter every part for {name}, or leave them all empty.", { name: studs.get(sid).name }));
        parts = Object.fromEntries(e.parts.map((x) => [x.key, mark(got[x.key], x.full)]));
        value = Object.values(parts).reduce((a, b) => a + b, 0);
      } else value = mark(v, e.full_marks);
      await q.query(`INSERT INTO marks (exam_id, student_id, value, parts) VALUES ($1, $2, $3, $4) ON CONFLICT (exam_id, student_id) DO UPDATE SET value = EXCLUDED.value, parts = EXCLUDED.parts`, [e.id, sid, value, parts && JSON.stringify(parts)]);
    }
  },
  "results.publish": async (q, user, input) => {
    only(user, "admin");
    const term = text(input.term, 80);
    need(await q.one(`SELECT 1 FROM exams WHERE term = $1 LIMIT 1`, [term]), "That exam term doesn't exist.");
    await q.query(`UPDATE settings SET published = published || jsonb_build_object($1::text, $2::boolean) WHERE id = 1`, [term, !!input.on]);
  },

  // ---------- students & teachers (admin) ----------
  "student.save": async (q, user, input) => {
    only(user, "admin");
    const name = text(input.name, 80), guardian = text(input.guardian, 80), phone = text(input.phone, 30);
    need(name && guardian, "Name and guardian are required.");
    need(["Male", "Female"].includes(input.gender), "Pick a gender.");
    need(!input.dob || isIsoDate(input.dob), "That date of birth isn't valid.");
    const c = await classAndSection(q, input.classId, input.section);
    const religion = input.religion || "islam", optional = input.optional || null;
    need(RELIGIONS.includes(religion), "Pick a religion.");
    need(!optional || optionalChoices(clsOf(c), input.section).includes(optional), "Pick a 4th subject open to that section.");
    if (input.id) {
      const s = await getStudent(q, input.id);
      need(s, "That student no longer exists.", 404);
      const moved = s.class_id !== input.classId || s.section !== input.section;
      const roll = moved ? await nextRoll(q, input.classId, input.section, s.id) : s.roll;
      await q.query(`UPDATE students SET name = $2, gender = $3, dob = COALESCE(NULLIF($4, ''), dob), guardian = $5, phone = $6, class_id = $7, section = $8, roll = $9, religion = $10, optional_subject = $11 WHERE id = $1`,
        [s.id, name, input.gender, input.dob || "", guardian, phone, input.classId, input.section, roll, religion, optional]);
      return { id: s.id };
    }
    const n = (await q.one(`SELECT max(substring(id from 2)::int) AS n FROM students WHERE id ~ '^s[0-9]+$'`)).n || 0;
    const id = `s${String(n + 1).padStart(3, "0")}`;
    const roll = await nextRoll(q, input.classId, input.section);
    const year = (await q.one(`SELECT year FROM settings WHERE id = 1`)).year;
    await q.query(`INSERT INTO students (id, name, roll, class_id, section, gender, guardian, phone, dob, admitted, religion, optional_subject) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, name, roll, input.classId, input.section, input.gender, guardian, phone || "—", input.dob || `${Number(year) - 10}-01-01`, schoolToday(), religion, optional]);
    await q.query(`INSERT INTO fees (student_id, month) VALUES ($1, $2)`, [id, schoolMonth()]);
    return { id, roll, accounts: await addFamilyAccounts(q, id) };
  },
  "student.delete": async (q, user, input) => {
    only(user, "admin");
    const s = await getStudent(q, input.id);
    need(s, "That student no longer exists.", 404);
    await q.query(`DELETE FROM users WHERE person_id = $1 AND role IN ('student', 'parent')`, [s.id]);
    await q.query(`DELETE FROM students WHERE id = $1`, [s.id]);
  },
  "teacher.save": async (q, user, input) => {
    only(user, "admin");
    const name = text(input.name, 80), subject = text(input.subject, 60), email = text(input.email, 120), phone = text(input.phone, 30);
    need(name, "Name is required.");
    need(subject, "Pick a subject.");
    const words = name.split(/\s+/);
    const initials = (text(input.initials, 4) || (words.slice(0, 2).map((w) => w[0]).join("") + (words.at(-1)[1] || ""))).toUpperCase().slice(0, 4);
    need(/^[A-Z0-9]{2,4}$/.test(initials), "Initials should be 2–4 letters.");
    need(!(await q.one(`SELECT 1 FROM teachers WHERE initials = $1 AND id IS DISTINCT FROM $2`, [initials, input.id ?? null])), T("{initials} is already used by another teacher.", { initials }));
    if (input.id) {
      const r = await q.query(`UPDATE teachers SET name = $2, subject = $3, initials = $4, email = $5, phone = $6 WHERE id = $1`, [input.id, name, subject, initials, email, phone]);
      need(changed(r), "That teacher no longer exists.", 404);
      return { id: input.id };
    }
    // A new teacher's id doubles as their username, so keep it short.
    let id = initials.toLowerCase();
    for (let i = 2; await q.one(`SELECT 1 FROM users WHERE username = $1 UNION ALL SELECT 1 FROM teachers WHERE id = $1`, [id]); i++) id = `${initials.toLowerCase()}${i}`;
    await q.query(`INSERT INTO teachers (id, name, subject, initials, email, phone, joined) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, name, subject, initials, email, phone || "—", schoolToday()]);
    return { id, accounts: [await addTeacherAccount(q, id)] };
  },
  "teacher.delete": async (q, user, input) => {
    only(user, "admin");
    const t = await getTeacher(q, input.id);
    need(t, "That teacher no longer exists.", 404);
    const n = (await q.one(`SELECT count(*)::int AS n FROM timetable WHERE teacher_id = $1`, [t.id])).n;
    need(!n, T("{name} still has {n} periods. Give them to other teachers in the Timetable first.", { name: t.name, n }));
    await q.query(`DELETE FROM users WHERE person_id = $1 AND role = 'teacher'`, [t.id]);
    await q.query(`DELETE FROM teachers WHERE id = $1`, [t.id]);
  },

  // A new one-time code for someone's account ("t:tnr", or "s:s113" for a family).
  // Also how a forgotten password is reset: the old one stops working.
  "account.reset": async (q, user, input) => {
    only(user, "admin");
    const [k, personId] = String(input.key ?? "").split(":");
    const role = { t: "teacher", s: "student" }[k];
    need(role && personId, "Pick an account.");
    const u = await q.one(`SELECT id, username FROM users WHERE role = $1 AND person_id = $2`, [role, personId]);
    need(u, "That account doesn't exist.", 404);
    return { role, personId, username: u.username, ...(await issueCode(q, u.id)) };
  },

  // ---------- fees ----------
  "fee.record": async (q, user, input) => {
    only(user, "admin");
    need(isIsoDate(input.paidOn) && input.paidOn <= schoolToday(), "Pick the date it was paid.");
    need(PAYMENT_METHODS.includes(input.method), "Pick a payment method.");
    const r = await q.query(`UPDATE fees SET paid_on = $3, method = $4 WHERE student_id = $1 AND month = $2`, [input.studentId, input.month, input.paidOn, input.method]);
    need(changed(r), "There's no bill for that month.", 404);
  },
  "fee.undo": async (q, user, input) => {
    only(user, "admin");
    await q.query(`UPDATE fees SET paid_on = NULL, method = NULL WHERE student_id = $1 AND month = $2`, [input.studentId, input.month]);
  },
  // Demo only: no money moves, the payment is simply recorded.
  "fee.pay": async (q, user, input) => {
    only(user, "student");
    need(PAYMENT_METHODS.includes(input.method), "Pick a payment method.");
    const r = await q.query(`UPDATE fees SET paid_on = $3, method = $4 WHERE student_id = $1 AND month = $2 AND paid_on IS NULL`, [user.personId, input.month, schoolToday(), input.method]);
    need(changed(r), "That month is already paid.");
  },
  "fees.remind": async (q, user, input) => {
    only(user, "admin");
    need(/^\d{4}-\d{2}$/.test(input.month ?? ""), "Pick a month.");
    const n = (await q.one(`SELECT count(*)::int AS n FROM fees WHERE month = $1 AND paid_on IS NULL`, [input.month])).n;
    await q.query(`UPDATE settings SET reminders = reminders || jsonb_build_object($1::text, $2::text) WHERE id = 1`, [input.month, schoolToday()]);
    return { sent: n };
  },

  // ---------- notices ----------
  "notice.create": async (q, user, input) => {
    only(user, "admin");
    const topic = text(input.topic, 160), body = text(input.body, 5000);
    need(topic && body, "Add a topic and the notice text.");
    need(AUDIENCES.includes(input.audience), "Pick who it's for.");
    await q.query(`INSERT INTO notices (id, number, date, topic, body, audience) VALUES ($1, $2, $3, $4, $5, $6)`, [newId("n"), await nextNoticeNumber(q), schoolToday(), topic, body, input.audience]);
  },
  "notice.delete": async (q, user, input) => {
    only(user, "admin");
    await q.query(`DELETE FROM notices WHERE id = $1`, [input.id]);
  },
  // Tell guardians of low-attendance classes, as a notice.
  "attendance.alert": async (q, user, input) => {
    only(user, "admin");
    const ids = Array.isArray(input.classIds) ? input.classIds.map(String) : [];
    need(ids.length, "Pick at least one class.");
    const classes = await q.rows(`SELECT name FROM classes WHERE id = ANY($1) ORDER BY level`, [ids]);
    need(classes.length === ids.length, "Some of those classes no longer exist.");
    const th = (await q.one(`SELECT threshold FROM settings WHERE id = 1`)).threshold;
    const names = classes.map((c) => D(c.name)).join(", ");
    await q.query(`INSERT INTO notices (id, number, date, topic, body, audience) VALUES ($1, $2, $3, $4, $5, 'Guardians')`, [newId("n"), await nextNoticeNumber(q), schoolToday(),
      T("Attendance reminder — {names}", { names }), T("Attendance in {names} has fallen below {th}% recently. Guardians are requested to make sure students attend every school day and to inform the class teacher about any absence.", { names, th })]);
    return { names };
  },

  // ---------- attendance (teacher) ----------
  "attendance.save": async (q, user, input) => {
    only(user, "teacher", "admin");
    const { date, classId, section } = input;
    need(isIsoDate(date) && date <= schoolToday(), "Pick a date up to today.");
    need(await schoolDay(q, date), T("{day} isn't a school day.", { day: weekday(date) }));
    await classAndSection(q, classId, section);
    // Only the section's class teacher takes attendance (or the admin, e.g.
    // for a section that has no class teacher yet).
    if (user.role === "teacher") need(await q.one(`SELECT 1 FROM class_teachers WHERE class_id = $1 AND section = $2 AND teacher_id = $3`, [classId, section, user.personId]), "Only the class teacher can take attendance for this section.", 403);
    const takenBy = user.role === "admin" ? "admin" : user.personId;
    const studs = await q.rows(`SELECT id FROM students WHERE class_id = $1 AND section = $2`, [classId, section]);
    const marks = input.marks && typeof input.marks === "object" ? input.marks : {};
    await q.query(`DELETE FROM attendance WHERE date = $1 AND class_id = $2 AND section = $3`, [date, classId, section]);
    const rows = studs.map((s) => ({ date, class_id: classId, section, student_id: s.id, mark: ["P", "A", "L"].includes(marks[s.id]) ? marks[s.id] : "P" }));
    for (const r of rows) await q.query(`INSERT INTO attendance (date, class_id, section, student_id, mark, taken_by) VALUES ($1, $2, $3, $4, $5, $6)`, [r.date, r.class_id, r.section, r.student_id, r.mark, takenBy]);
    return { present: rows.filter((r) => r.mark !== "A").length, absent: rows.filter((r) => r.mark === "A").length };
  },

  // ---------- homework ----------
  "homework.save": async (q, user, input) => {
    only(user, "teacher");
    const topic = text(input.topic, 160), details = text(input.details, 5000) || "See class notes.";
    need(topic, "Add a topic.");
    need(isIsoDate(input.due), "Pick a due date.");
    need(await teaches(q, user.personId, input.classId, input.section, input.subject), "You don't teach that subject in that section.", 403);
    if (input.id) {
      const h = await q.one(`SELECT teacher_id FROM homework WHERE id = $1`, [input.id]);
      need(h, "That homework no longer exists.", 404);
      need(h.teacher_id === user.personId, "Only the teacher who set it can change it.", 403);
      await q.query(`UPDATE homework SET class_id = $2, section = $3, subject = $4, topic = $5, details = $6, due = $7 WHERE id = $1`, [input.id, input.classId, input.section, input.subject, topic, details, input.due]);
    } else {
      need(input.due >= schoolToday(), "The due date can't be in the past.");
      await q.query(`INSERT INTO homework (id, class_id, section, subject, teacher_id, topic, details, assigned, due) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [newId("h"), input.classId, input.section, input.subject, user.personId, topic, details, schoolToday(), input.due]);
    }
  },
  "homework.delete": async (q, user, input) => {
    only(user, "teacher");
    await q.query(`DELETE FROM homework WHERE id = $1 AND teacher_id = $2`, [input.id, user.personId]);
  },
  "homework.review": async (q, user, input) => {
    only(user, "teacher");
    need(await q.one(`SELECT 1 FROM homework WHERE id = $1 AND teacher_id = $2`, [input.id, user.personId]), "That isn't your homework.", 403);
    await q.query(`UPDATE submissions SET reviewed = NOT reviewed WHERE homework_id = $1 AND student_id = $2`, [input.id, input.studentId]);
  },
  "homework.reviewAll": async (q, user, input) => {
    only(user, "teacher");
    need(await q.one(`SELECT 1 FROM homework WHERE id = $1 AND teacher_id = $2`, [input.id, user.personId]), "That isn't your homework.", 403);
    await q.query(`UPDATE submissions SET reviewed = true WHERE homework_id = $1`, [input.id]);
  },
  "homework.submit": async (q, user, input) => {
    only(user, "student");
    const s = await getStudent(q, user.personId);
    need(await q.one(`SELECT 1 FROM homework WHERE id = $1 AND class_id = $2 AND section = $3`, [input.id, s.class_id, s.section]), "That homework isn't for your section.", 403);
    await q.query(`INSERT INTO submissions (homework_id, student_id, submitted_on) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [input.id, s.id, schoolToday()]);
  },
};

// Actions that belong to an optional feature, by their name's first part.
const FEATURE_OF = { homework: "homework" };

// ctx.lang ("en" or "bn") picks the language of error messages and of any
// text the action writes (e.g. an attendance-alert notice).
export function runAction(user, op, input, ctx = {}) {
  return langStore.run(ctx.lang ?? "en", async () => {
    const fn = Object.hasOwn(ACTIONS, op) ? ACTIONS[op] : null;
    need(fn, "Unknown action.", 404);
    const feature = FEATURE_OF[op.split(".")[0]];
    return (await tx(async (q) => {
      if (feature) need((await q.one(`SELECT features->>$1 AS enabled FROM settings WHERE id = 1`, [feature]))?.enabled === "true", T("{feature} is turned off for this school.", { feature: T(FEATURES[feature].label) }), 403);
      return fn(q, user, input && typeof input === "object" ? input : {}, ctx);
    })) ?? {};
  });
}


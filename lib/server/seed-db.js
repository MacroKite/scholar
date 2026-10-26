// Scholar — fill the database with the demo school (lib/school/seed.js).
// Wipes every table first, so it doubles as "Reset demo data".

import { seedSchool } from "../school/seed.js";
import { DATA_TABLES } from "./schema.js";
import { DEMO_PASSWORD, hashPassword, userRow } from "./accounts.js";
import { schoolToday } from "./clock.js";

// Insert many rows in one statement: the rows travel as a single JSON value.
export async function insertRows(q, table, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const list = cols.map((c) => `"${c}"`).join(", ");
  for (let i = 0; i < rows.length; i += 2000) {
    await q.query(`INSERT INTO ${table} (${list}) SELECT ${list} FROM json_populate_recordset(NULL::${table}, $1::json)`, [JSON.stringify(rows.slice(i, i + 2000))]);
  }
}

export async function seedDatabase(q) {
  const today = schoolToday();
  const s = seedSchool({ today });
  await q.query(`TRUNCATE ${DATA_TABLES.join(", ")} RESTART IDENTITY CASCADE`);

  await insertRows(q, "settings", [{
    id: 1, school: s.settings.school, year: s.settings.year, threshold: s.settings.threshold,
    admin_name: s.settings.adminName, admin_email: s.settings.adminEmail,
    grading: s.grading, published: s.published, reminders: s.reminders, schedule: s.schedule,
    demo: { teacher: s.personas.teacher, student: s.personas.student }, seeded_on: today,
  }]);
  await insertRows(q, "teachers", s.teachers.map((t) => ({ id: t.id, name: t.name, subject: t.subject, initials: t.initials, email: t.email, phone: t.phone, joined: t.joined })));
  await insertRows(q, "classes", s.classes.map((c) => ({ id: c.id, level: c.level, name: c.name, short: c.short, year: c.year, sections: c.sections, subjects: c.subjects, section_meta: c.sectionMeta, subject_rules: c.subjectRules, fee: c.fee })));
  await insertRows(q, "students", s.students.map((x) => ({ id: x.id, name: x.name, roll: x.roll, class_id: x.classId, section: x.section, gender: x.gender, guardian: x.guardian, phone: x.phone, dob: x.dob, admitted: x.admitted, religion: x.religion, optional_subject: x.optional, discount: x.discount })));
  await insertRows(q, "timetable", s.timetable.map((x) => ({ id: x.id, day: x.day, period: x.period, class_id: x.classId, section: x.section, subject: x.subject, teacher_id: x.teacherId, room: x.room })));
  await insertRows(q, "class_teachers", Object.entries(s.classTeachers).map(([key, tid]) => {
    const [classId, section] = key.split("|");
    return { class_id: classId, section, teacher_id: tid };
  }));
  await insertRows(q, "attendance", Object.entries(s.attendance).flatMap(([key, marks]) => {
    const [date, classId, section] = key.split("|");
    const takenBy = s.classTeachers[`${classId}|${section}`] ?? "admin";
    return Object.entries(marks).map(([sid, mark]) => ({ date, class_id: classId, section, student_id: sid, mark, taken_by: takenBy }));
  }));
  await insertRows(q, "exams", s.exams.map((e) => ({ id: e.id, term: e.term, subject: e.subject, class_id: e.classId, date: e.date, start: e.start, full_marks: e.fullMarks, parts: e.parts, year: s.settings.year })));
  await insertRows(q, "marks", Object.entries(s.marks).flatMap(([eid, m]) => Object.entries(m).map(([sid, x]) => ({ exam_id: eid, student_id: sid, value: x.value, parts: x.parts ?? null }))));
  await insertRows(q, "charges", s.charges.map((c) => ({ id: c.id, student_id: c.studentId, kind: c.kind, label: c.label, period: c.period, amount: c.amount, discount: c.discount, due_on: c.dueOn, created_on: c.createdOn })));
  await insertRows(q, "payments", s.payments.map((x) => ({ id: x.id, receipt_no: x.receiptNo, student_id: x.studentId, paid_on: x.paidOn, amount: x.amount, method: x.method, note: "", received_by: "admin" })));
  await insertRows(q, "payment_items", s.payments.flatMap((x) => x.items.map((i) => ({ payment_id: x.id, charge_id: i.chargeId, amount: i.amount }))));
  await insertRows(q, "homework", s.homework.map((h) => ({ id: h.id, class_id: h.classId, section: h.section, subject: h.subject, teacher_id: h.teacherId, topic: h.topic, details: h.details, assigned: h.assigned, due: h.due })));
  await insertRows(q, "submissions", s.homework.flatMap((h) => Object.entries(h.submissions).map(([sid, x]) => ({ homework_id: h.id, student_id: sid, submitted_on: x.on, reviewed: x.reviewed }))));
  await insertRows(q, "notices", s.notices.map((n) => ({ id: n.id, number: n.number, date: n.date, topic: n.topic, body: n.body, audience: n.audience })));

  // Everyone starts with the demo password. Hashing it ~300 times would take
  // several seconds, so the demo accounts share one hash; any password a
  // user sets later gets its own salt.
  const hash = await hashPassword(DEMO_PASSWORD);
  await insertRows(q, "users", [
    userRow("admin", null, hash),
    ...s.teachers.map((t) => userRow("teacher", t.id, hash)),
    ...s.students.map((x) => userRow("student", x.id, hash)),
  ]);
}

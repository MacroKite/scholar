// Scholar — what each signed-in user gets to see.
// Builds the same state shape the browser app has always worked with, but
// only with the rows that user is allowed to read:
//   admin    everything
//   teacher  the school's timetable, exams and teachers, plus the students,
//            attendance and marks of the sections they teach. Guardians'
//            phone numbers only for sections they're class teacher of;
//            fees never.
//   student  (one account, shared with the guardian) their own record;
//            classmates appear only as anonymous entries so positions and
//            "highest in class" still work, and only for published results

import { query, one } from "./db.js";
import { schoolToday, schoolMonth } from "./clock.js";
import { withDefaults } from "../school/features.js";
import { scheduleOf, takesSubject } from "../school/rules.js";
import { ensureTuition } from "./fees.js";
import { smsConfigured } from "./sms.js";
import { websiteOf } from "../school/website.js";

// A student's account (shared with the guardian) reads notices meant for
// students and for guardians.
const AUDIENCE = { admin: null, teacher: ["Everyone", "Teachers"], student: ["Everyone", "Students", "Guardians"] };

const STUDENT_COLS = `id, name, roll, class_id AS "classId", section, gender, guardian, phone, dob, admitted, religion, optional_subject AS "optional", discount`;
// Fees: what each student owes (paid = what's been paid towards it) and the payments, with what each paid for.
const CHARGE_COLS = `c.id, c.student_id AS "studentId", c.kind, c.label, c.period, c.amount, c.discount, c.due_on AS "dueOn", c.created_on AS "createdOn",
  COALESCE((SELECT sum(i.amount) FROM payment_items i WHERE i.charge_id = c.id), 0)::int AS paid`;
const PAYMENT_COLS = `p.id, p.receipt_no AS "receiptNo", p.student_id AS "studentId", p.paid_on AS "paidOn", p.amount, p.method, p.note, p.received_by AS "receivedBy",
  COALESCE((SELECT json_agg(json_build_object('chargeId', i.charge_id, 'amount', i.amount)) FROM payment_items i WHERE i.payment_id = p.id), '[]') AS items`;
const EXAM_COLS = `id, term, subject, class_id AS "classId", date, start, full_marks AS "fullMarks", parts`;

// Sections a teacher has periods in or is class teacher of, as [classId, section] pairs.
export async function teacherSections(teacherId) {
  const rows = await query(`SELECT class_id, section FROM timetable WHERE teacher_id = $1
                            UNION SELECT class_id, section FROM class_teachers WHERE teacher_id = $1`, [teacherId]);
  return rows.map((r) => [r.class_id, r.section]);
}

export async function buildState(user) {
  const role = user.role, me = user.personId, today = schoolToday();
  // A new month means a new tuition bill for every student.
  await ensureTuition({ query }, schoolMonth());

  const st = await one(`SELECT * FROM settings WHERE id = 1`);
  const [classes, teachers, notices, ctRows] = await Promise.all([
    query(`SELECT id, level, name, short, year, sections, subjects, section_meta AS "sectionMeta", subject_rules AS "subjectRules", fee FROM classes ORDER BY level, name`),
    query(`SELECT id, name, subject, initials, email, ${role === "admin" || role === "teacher" ? "phone" : "'' AS phone"}, joined FROM teachers ORDER BY name`),
    query(`SELECT id, number, date, topic, body, audience FROM notices ${AUDIENCE[role] ? "WHERE audience = ANY($1)" : ""} ORDER BY date DESC, number DESC`, AUDIENCE[role] ? [AUDIENCE[role]] : []),
    query(`SELECT class_id, section, teacher_id FROM class_teachers`),
  ]);
  // Who is class teacher of each section, as { "classId|section": teacherId }.
  const classTeachers = Object.fromEntries(ctRows.map((r) => [`${r.class_id}|${r.section}`, r.teacher_id]));

  let students, attendanceRows, exams, markRows, charges = [], payments = [], homework, submissionRows, timetable;
  let anon = null; // student: real id → anonymous id for classmates

  if (role === "admin" || role === "teacher") {
    const secs = role === "teacher" ? await teacherSections(me) : null;
    // For a teacher, rows are limited to their sections ("classId|section" keys).
    const where = secs ? `WHERE (class_id || '|' || section) = ANY($1)` : "";
    const wp = secs ? [secs.map(([c, s]) => `${c}|${s}`)] : [];
    timetable = await query(`SELECT id, day, period, class_id AS "classId", section, subject, teacher_id AS "teacherId", room FROM timetable ORDER BY day, period`);
    students = await query(`SELECT ${STUDENT_COLS} FROM students ${where ? `${where} AND` : "WHERE"} left_on IS NULL ORDER BY id`, wp);
    // Guardians' phone numbers go to the admin and each section's class teacher only.
    if (role === "teacher") students.forEach((s) => { if (classTeachers[`${s.classId}|${s.section}`] !== me) s.phone = ""; });
    attendanceRows = await query(`SELECT date, class_id, section, student_id, mark, taken_by FROM attendance ${where}`, wp);
    exams = await query(`SELECT ${EXAM_COLS} FROM exams WHERE year = $1 ORDER BY date, start`, [st.year]);
    markRows = role === "admin"
      ? await query(`SELECT m.exam_id, m.student_id, m.value, m.parts FROM marks m JOIN exams e ON e.id = m.exam_id WHERE e.year = $1`, [st.year])
      // A teacher sees marks for the subjects they teach, in their sections.
      : await query(`SELECT m.exam_id, m.student_id, m.value, m.parts FROM marks m JOIN exams e ON e.id = m.exam_id JOIN students s ON s.id = m.student_id
                      WHERE EXISTS (SELECT 1 FROM timetable t WHERE t.teacher_id = $1 AND t.class_id = e.class_id AND t.subject = e.subject AND t.section = s.section)`, [me]);
    if (role === "admin") {
      charges = await query(`SELECT ${CHARGE_COLS} FROM charges c JOIN students s ON s.id = c.student_id WHERE s.left_on IS NULL ORDER BY c.due_on, c.id`);
      payments = await query(`SELECT ${PAYMENT_COLS} FROM payments p ORDER BY p.receipt_no DESC`);
    }
    homework = await query(`SELECT id, class_id AS "classId", section, subject, teacher_id AS "teacherId", topic, details, assigned, due FROM homework ${role === "teacher" ? "WHERE teacher_id = $1" : ""} ORDER BY due`, role === "teacher" ? [me] : []);
    submissionRows = await query(`SELECT homework_id, student_id, submitted_on, reviewed FROM submissions WHERE homework_id = ANY($1)`, [homework.map((h) => h.id)]);
  } else {
    const s = await one(`SELECT ${STUDENT_COLS} FROM students WHERE id = $1`, [me]);
    if (!s) throw new Error("This account's student record no longer exists.");
    const published = Object.keys(st.published).filter((t) => st.published[t]);
    const classmates = await query(`SELECT id, roll, section FROM students WHERE class_id = $1 AND id <> $2 AND left_on IS NULL ORDER BY id`, [s.classId, s.id]);
    anon = new Map(classmates.map((c, i) => [c.id, `x${i + 1}`]));
    students = [s, ...classmates.filter((c) => c.section === s.section).map((c) => ({ id: anon.get(c.id), name: "Classmate", roll: c.roll, classId: s.classId, section: c.section, anonymous: true }))];
    // Only the periods of subjects they take (their religion, their 4th subject).
    const cls = classes.find((c) => c.id === s.classId);
    timetable = (await query(`SELECT id, day, period, class_id AS "classId", section, subject, teacher_id AS "teacherId", room FROM timetable WHERE class_id = $1 AND section = $2 ORDER BY day, period`, [s.classId, s.section]))
      .filter((x) => takesSubject(s, cls, x.subject));
    attendanceRows = await query(`SELECT date, class_id, section, student_id, mark, taken_by FROM attendance WHERE student_id = $1`, [s.id]);
    exams = await query(`SELECT ${EXAM_COLS} FROM exams WHERE class_id = $1 AND year = $2 ORDER BY date, start`, [s.classId, st.year]);
    markRows = (await query(`SELECT m.exam_id, m.student_id, m.value, m.parts FROM marks m JOIN exams e ON e.id = m.exam_id WHERE e.class_id = $1 AND e.term = ANY($2) AND e.year = $3`, [s.classId, published, st.year]))
      .map((m) => (m.student_id === s.id ? m : { ...m, student_id: anon.get(m.student_id) || "x0" }));
    charges = await query(`SELECT ${CHARGE_COLS} FROM charges c WHERE c.student_id = $1 ORDER BY c.due_on, c.id`, [s.id]);
    payments = await query(`SELECT ${PAYMENT_COLS} FROM payments p WHERE p.student_id = $1 ORDER BY p.receipt_no DESC`, [s.id]);
    homework = await query(`SELECT id, class_id AS "classId", section, subject, teacher_id AS "teacherId", topic, details, assigned, due FROM homework WHERE class_id = $1 AND section = $2 ORDER BY due`, [s.classId, s.section]);
    submissionRows = await query(`SELECT homework_id, student_id, submitted_on, reviewed FROM submissions WHERE student_id = $1`, [s.id]);
  }

  const attendance = {}, attendanceBy = {};
  attendanceRows.forEach((r) => {
    const key = `${r.date}|${r.class_id}|${r.section}`;
    (attendance[key] ||= {})[r.student_id] = r.mark;
    if (r.taken_by) attendanceBy[key] = r.taken_by;
  });
  // marks: { examId: { studentId: total } }; markParts: the part marks of exams that have parts.
  const marks = {}, markParts = {};
  markRows.forEach((r) => {
    (marks[r.exam_id] ||= {})[r.student_id] = r.value;
    if (r.parts) (markParts[r.exam_id] ||= {})[r.student_id] = r.parts;
  });
  // Admin: the website's own content, and enquiries sent from it (newest first).
  const website = role === "admin"
    ? { content: websiteOf(st.website), enquiries: (await query(`SELECT id, created_at AS "createdAt", kind, name, phone, class_name AS "className", message, handled FROM enquiries ORDER BY created_at DESC LIMIT 300`))
        .map((e) => ({ ...e, createdAt: new Date(e.createdAt).toISOString() })) }
    : null;
  // Admin: the SMS outbox (latest first) and whether a gateway is set up.
  const sms = role === "admin"
    ? { configured: smsConfigured(), settings: { absent: true, results: true, lang: "bn", ...(st.sms || {}) },
        outbox: (await query(`SELECT m.id, m.created_at AS "createdAt", m.student_id AS "studentId", s.name, m.phone, m.kind, m.body, m.status, m.error
                             FROM sms m LEFT JOIN students s ON s.id = m.student_id ORDER BY m.created_at DESC LIMIT 400`))
          // As text, so the first page load (React props) and /api/state agree.
          .map((m) => ({ ...m, createdAt: new Date(m.createdAt).toISOString() })) }
    : null;
  const subs = {};
  submissionRows.forEach((r) => { (subs[r.homework_id] ||= {})[r.student_id] = { on: r.submitted_on, reviewed: r.reviewed }; });

  // Admin: each person's sign-in account, keyed like "t:tnr" / "s:s113".
  const accounts = role === "admin"
    ? Object.fromEntries((await query(`SELECT role, person_id, username, password_hash IS NOT NULL AS active, invite_expires FROM users WHERE role <> 'admin'`))
      .map((a) => [`${a.role[0]}:${a.person_id}`, { username: a.username, active: a.active, expires: a.invite_expires ? new Date(a.invite_expires).toISOString() : null }]))
    : {};

  // Optional features (homework) the school has turned off send no data at all.
  const on = withDefaults(st.features);
  const prefs = user.prefs || {};
  return {
    today,
    role,
    username: user.username,
    settings: { adminName: st.admin_name, school: st.school, year: st.year, threshold: st.threshold, ...(role === "admin" ? { adminEmail: st.admin_email } : {}) },
    personas: { teacher: role === "teacher" ? me : null, student: role === "student" ? me : null },
    features: on,
    schedule: scheduleOf(st.schedule),
    grading: st.grading,
    published: st.published,
    reminders: role === "admin" ? st.reminders : {},
    teachers, classes, students, timetable, classTeachers, attendance, attendanceBy, exams, marks, markParts, charges, payments, sms, website,
    homework: on.homework ? homework.map((h) => ({ ...h, submissions: subs[h.id] || {} })) : [],
    notices,
    accounts,
    readNotifs: Array.isArray(prefs.readNotifs) ? prefs.readNotifs : [],
    navOpen: prefs.navOpen || {},
  };
}

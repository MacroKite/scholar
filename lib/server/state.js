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

// A student's account (shared with the guardian) reads notices meant for
// students and for guardians.
const AUDIENCE = { admin: null, teacher: ["Everyone", "Teachers"], student: ["Everyone", "Students", "Guardians"] };

const STUDENT_COLS = `id, name, roll, class_id AS "classId", section, gender, guardian, phone, dob, admitted, religion, optional_subject AS "optional"`;
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
  await query(`INSERT INTO fees (student_id, month) SELECT id, $1 FROM students ON CONFLICT DO NOTHING`, [schoolMonth()]);

  const st = await one(`SELECT * FROM settings WHERE id = 1`);
  const [classes, teachers, notices, ctRows] = await Promise.all([
    query(`SELECT id, level, name, short, year, sections, subjects, section_meta AS "sectionMeta", subject_rules AS "subjectRules", fee FROM classes ORDER BY level, name`),
    query(`SELECT id, name, subject, initials, email, ${role === "admin" || role === "teacher" ? "phone" : "'' AS phone"}, joined FROM teachers ORDER BY name`),
    query(`SELECT id, number, date, topic, body, audience FROM notices ${AUDIENCE[role] ? "WHERE audience = ANY($1)" : ""} ORDER BY date DESC, number DESC`, AUDIENCE[role] ? [AUDIENCE[role]] : []),
    query(`SELECT class_id, section, teacher_id FROM class_teachers`),
  ]);
  // Who is class teacher of each section, as { "classId|section": teacherId }.
  const classTeachers = Object.fromEntries(ctRows.map((r) => [`${r.class_id}|${r.section}`, r.teacher_id]));

  let students, attendanceRows, exams, markRows, feeRows, homework, submissionRows, timetable;
  let anon = null; // student: real id → anonymous id for classmates

  if (role === "admin" || role === "teacher") {
    const secs = role === "teacher" ? await teacherSections(me) : null;
    // For a teacher, rows are limited to their sections ("classId|section" keys).
    const where = secs ? `WHERE (class_id || '|' || section) = ANY($1)` : "";
    const wp = secs ? [secs.map(([c, s]) => `${c}|${s}`)] : [];
    timetable = await query(`SELECT id, day, period, class_id AS "classId", section, subject, teacher_id AS "teacherId", room FROM timetable ORDER BY day, period`);
    students = await query(`SELECT ${STUDENT_COLS} FROM students ${where} ORDER BY id`, wp);
    // Guardians' phone numbers go to the admin and each section's class teacher only.
    if (role === "teacher") students.forEach((s) => { if (classTeachers[`${s.classId}|${s.section}`] !== me) s.phone = ""; });
    const ids = role === "admin" ? students.map((s) => s.id) : [];
    attendanceRows = await query(`SELECT date, class_id, section, student_id, mark, taken_by FROM attendance ${where}`, wp);
    exams = await query(`SELECT ${EXAM_COLS} FROM exams ORDER BY date, start`);
    markRows = role === "admin"
      ? await query(`SELECT exam_id, student_id, value, parts FROM marks`)
      // A teacher sees marks for the subjects they teach, in their sections.
      : await query(`SELECT m.exam_id, m.student_id, m.value, m.parts FROM marks m JOIN exams e ON e.id = m.exam_id JOIN students s ON s.id = m.student_id
                      WHERE EXISTS (SELECT 1 FROM timetable t WHERE t.teacher_id = $1 AND t.class_id = e.class_id AND t.subject = e.subject AND t.section = s.section)`, [me]);
    feeRows = await query(`SELECT student_id, month, paid_on, method FROM fees WHERE student_id = ANY($1)`, [ids]);
    homework = await query(`SELECT id, class_id AS "classId", section, subject, teacher_id AS "teacherId", topic, details, assigned, due FROM homework ${role === "teacher" ? "WHERE teacher_id = $1" : ""} ORDER BY due`, role === "teacher" ? [me] : []);
    submissionRows = await query(`SELECT homework_id, student_id, submitted_on, reviewed FROM submissions WHERE homework_id = ANY($1)`, [homework.map((h) => h.id)]);
  } else {
    const s = await one(`SELECT ${STUDENT_COLS} FROM students WHERE id = $1`, [me]);
    if (!s) throw new Error("This account's student record no longer exists.");
    const published = Object.keys(st.published).filter((t) => st.published[t]);
    const classmates = await query(`SELECT id, roll, section FROM students WHERE class_id = $1 AND id <> $2 ORDER BY id`, [s.classId, s.id]);
    anon = new Map(classmates.map((c, i) => [c.id, `x${i + 1}`]));
    students = [s, ...classmates.filter((c) => c.section === s.section).map((c) => ({ id: anon.get(c.id), name: "Classmate", roll: c.roll, classId: s.classId, section: c.section, anonymous: true }))];
    // Only the periods of subjects they take (their religion, their 4th subject).
    const cls = classes.find((c) => c.id === s.classId);
    timetable = (await query(`SELECT id, day, period, class_id AS "classId", section, subject, teacher_id AS "teacherId", room FROM timetable WHERE class_id = $1 AND section = $2 ORDER BY day, period`, [s.classId, s.section]))
      .filter((x) => takesSubject(s, cls, x.subject));
    attendanceRows = await query(`SELECT date, class_id, section, student_id, mark, taken_by FROM attendance WHERE student_id = $1`, [s.id]);
    exams = await query(`SELECT ${EXAM_COLS} FROM exams WHERE class_id = $1 ORDER BY date, start`, [s.classId]);
    markRows = (await query(`SELECT m.exam_id, m.student_id, m.value, m.parts FROM marks m JOIN exams e ON e.id = m.exam_id WHERE e.class_id = $1 AND e.term = ANY($2)`, [s.classId, published]))
      .map((m) => (m.student_id === s.id ? m : { ...m, student_id: anon.get(m.student_id) || "x0" }));
    feeRows = await query(`SELECT student_id, month, paid_on, method FROM fees WHERE student_id = $1`, [s.id]);
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
  const fees = {};
  feeRows.forEach((r) => { (fees[r.student_id] ||= {})[r.month] = r.paid_on ? { paidOn: r.paid_on, method: r.method } : null; });
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
    teachers, classes, students, timetable, classTeachers, attendance, attendanceBy, exams, marks, markParts, fees,
    homework: on.homework ? homework.map((h) => ({ ...h, submissions: subs[h.id] || {} })) : [],
    notices,
    accounts,
    readNotifs: Array.isArray(prefs.readNotifs) ? prefs.readNotifs : [],
    navOpen: prefs.navOpen || {},
  };
}

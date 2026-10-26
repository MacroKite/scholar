// Scholar — results and year-end promotion. Shared by the browser (pages,
// printed mark sheets, the promotion preview) and the server (result SMS,
// promotion), so both work out a result the same way.

import { failedParts, gpaOf, isOptionalSubject } from "./rules.js";

// ---------- grading (ranges come from the school's grading system) ----------
export function gradeIn(ranges, percent) {
  const p = Math.round(percent);
  return ranges.find((x) => p >= Number(x.start) && p <= Number(x.end)) || ranges[ranges.length - 1] || { grade: "–", point: 0 };
}
// The lowest grade is the fail grade.
export const failGrade = (ranges) => [...ranges].sort((a, b) => a.start - b.start)[0]?.grade;
export const hasPointsIn = (ranges) => ranges.some((r) => r.point !== "" && r.point != null);
// The grade a GPA earns: the best grade whose point it reaches.
export function gradeForPointIn(ranges, gpa) {
  const ranked = ranges.filter((r) => r.point !== "" && r.point != null).sort((a, b) => b.point - a.point);
  return (ranked.find((r) => gpa >= Number(r.point)) ?? ranked.at(-1))?.grade ?? "–";
}

// A student's result in one term.
//   exams: that term's exams the student takes (oldest first)
//   marks: { examId: { studentId: total } }, markParts: { examId: { studentId: { cq, mcq } } }
// A subject is an F if any part (CQ, MCQ, practical) is under its pass mark.
// The 4th subject only adds its points above 2.00 and can't fail the
// student. With points, the overall grade follows the GPA, as on SSC mark
// sheets.
export function resultOf({ studentId, cls, exams, marks, markParts, ranges }) {
  const rows = exams.map((e) => {
    const got = marks[e.id]?.[studentId];
    const has = got !== undefined && got !== null && got !== "";
    const parts = has ? markParts?.[e.id]?.[studentId] ?? null : null;
    const failed = has ? failedParts(e.parts, parts) : [];
    const pct = has ? (got / e.fullMarks) * 100 : null;
    const g = has ? gradeIn(ranges, failed.length ? 0 : pct) : null;
    return { exam: e, subject: e.subject, full: e.fullMarks, got: has ? Number(got) : null, pct, grade: g?.grade, point: g?.point, parts, failedParts: failed, optional: isOptionalSubject(cls, e.subject) };
  });
  const done = rows.filter((r) => r.got !== null);
  const total = done.reduce((s, r) => s + r.got, 0);
  const fullTotal = done.reduce((s, r) => s + r.full, 0);
  const F = failGrade(ranges);
  const isF = (r) => r.grade === F;
  const fail = done.some((r) => !r.optional && isF(r));
  const gpa = done.length && hasPointsIn(ranges) ? gpaOf(done.map((r) => ({ point: Number(r.point) || 0, optional: r.optional, failed: isF(r) }))).gpa : null;
  const grade = !done.length ? null : fail ? F : gpa !== null ? gradeForPointIn(ranges, gpa) : gradeIn(ranges, (total / fullTotal) * 100).grade;
  return {
    rows, done: done.length, count: rows.length, complete: rows.length > 0 && done.length === rows.length,
    total, fullTotal, gpa, grade, passed: done.length > 0 && !fail && grade !== F,
    percent: fullTotal ? (total / fullTotal) * 100 : null,
  };
}
// Better result first: GPA, then total marks.
export const byMerit = (a, b) => (b.gpa ?? -1) - (a.gpa ?? -1) || b.total - a.total;

// ---------- year-end promotion ----------
// Each class moves up to the class one level above; students of the top
// class pass out. Students who passed are promoted unless the admin unticks
// them, and a failed student can be promoted "on consideration" by ticking
// them. Everyone else stays in their class for another year.
// New roll numbers in each section go by merit: promoted students by their
// result, then the students repeating the class.
//   students: [{ id, classId, section, roll }]
//   results:  { studentId: { gpa, total, passed, done } }
//   choices:  { studentId: { promote: bool, section } } (missing = default)
// Returns { moves: [{ studentId, classId, section, roll }], passedOut: [ids] }.
export const nextClassOf = (classes, cls) => classes.find((c) => c.level === cls.level + 1) || null;
export function planPromotion({ classes, students, results, choices = {} }) {
  const promote = (s) => choices[s.id]?.promote ?? !!results[s.id]?.passed;
  const into = {}; // "classId|section" -> [{ s, repeat }]
  const passedOut = [];
  for (const s of students) {
    const cls = classes.find((c) => c.id === s.classId);
    if (!cls) continue;
    if (!promote(s)) { (into[`${cls.id}|${s.section}`] ||= []).push({ s, repeat: true }); continue; }
    const next = nextClassOf(classes, cls);
    if (!next) { passedOut.push(s.id); continue; }
    // The admin's pick, else the section of the same group (Science stays
    // Science), else the same section letter, else the first section.
    const want = choices[s.id]?.section;
    const group = cls.sectionMeta?.[s.section]?.group;
    const sameGroup = group && next.sections.find((x) => next.sectionMeta?.[x]?.group === group);
    const section = next.sections.includes(want) ? want : sameGroup || (next.sections.includes(s.section) ? s.section : next.sections[0]);
    (into[`${next.id}|${section}`] ||= []).push({ s, repeat: false });
  }
  const none = { gpa: null, total: 0 };
  const moves = [];
  for (const [key, list] of Object.entries(into)) {
    const [classId, section] = key.split("|");
    list.sort((a, b) => a.repeat - b.repeat || byMerit(results[a.s.id] ?? none, results[b.s.id] ?? none) || a.s.roll - b.s.roll);
    list.forEach(({ s }, i) => moves.push({ studentId: s.id, classId, section, roll: i + 1 }));
  }
  return { moves, passedOut };
}

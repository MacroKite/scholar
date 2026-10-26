// Scholar — how a Bangladeshi school marks, groups and schedules. Shared by
// the browser, the server and the demo seed.
//
//   • Exam parts: from Class 9 a subject is examined in parts (creative/CQ,
//     MCQ, practical). A student must pass every part (33% of its marks);
//     failing one part is an F in the subject, whatever the total.
//   • Groups: in Classes 9–10 each section is one group (Science, Business
//     Studies, Humanities). A class's subject rules say which groups take a
//     subject, which religion it is for, and whether it is an optional
//     (4th) subject that each student picks.
//   • GPA: the 4th subject only adds the points it earns above 2.00, and
//     failing it doesn't fail the student.
//   • Week & shifts: the school picks its days, and each shift (Morning,
//     Day) has its own periods. Every section belongs to one shift.

export const GROUPS = ["science", "business", "humanities"];
export const GROUP_LABELS = { science: "Science", business: "Business Studies", humanities: "Humanities" };
export const RELIGIONS = ["islam", "hindu", "buddhist", "christian"];
export const RELIGION_LABELS = { islam: "Islam", hindu: "Hinduism", buddhist: "Buddhism", christian: "Christianity" };

// ---------- exam parts ----------
export const PART_KEYS = ["cq", "mcq", "prac"];
export const PART_LABELS = { cq: "Creative (CQ)", mcq: "MCQ", prac: "Practical" };
export const PART_SHORT = { cq: "CQ", mcq: "MCQ", prac: "Prac." };
// Pass mark of a part, as the boards round it (70 → 23, 30 → 10, 25 → 8, 50 → 17).
export const passMark = (full) => Math.round(full * 0.33);
// An exam's parts are [{ key, full }]; no parts means one paper.
export const partsTotal = (parts) => (parts || []).reduce((s, p) => s + Number(p.full || 0), 0);
// The parts a student failed. got = { cq: 40, mcq: 8 }.
export const failedParts = (parts, got) => (parts || []).filter((p) => got?.[p.key] != null && Number(got[p.key]) < passMark(p.full)).map((p) => p.key);
// The subject's usual split, when the exam's full marks match it (a 25-mark
// class test is one paper).
export function defaultParts(rule, fullMarks) {
  const parts = rule?.parts;
  return parts?.length && partsTotal(parts) === Number(fullMarks) ? parts.map((p) => ({ key: p.key, full: p.full })) : [];
}
// Shape and sense of an exam's parts; returns a problem (English, for t()) or "".
export function partsProblem(parts, fullMarks) {
  if (!Array.isArray(parts)) return "Those exam parts aren't valid.";
  if (!parts.length) return "";
  const keys = parts.map((p) => p?.key);
  if (keys.some((k) => !PART_KEYS.includes(k)) || new Set(keys).size !== keys.length) return "Those exam parts aren't valid.";
  if (parts.some((p) => !Number.isInteger(Number(p.full)) || Number(p.full) < 1)) return "Each part needs its full marks.";
  if (parts.length < 2) return "Use at least two parts, or none.";
  if (partsTotal(parts) !== Number(fullMarks)) return "The parts must add up to the full marks.";
  return "";
}

// ---------- the usual SSC subjects (Classes 9–10) ----------
const CQ_MCQ = [{ key: "cq", full: 70 }, { key: "mcq", full: 30 }];
const WITH_PRAC = [{ key: "cq", full: 50 }, { key: "mcq", full: 25 }, { key: "prac", full: 25 }];
export const SSC_RULES = {
  Bangla: { parts: CQ_MCQ },
  Mathematics: { parts: CQ_MCQ },
  ICT: { parts: [{ key: "mcq", full: 25 }, { key: "prac", full: 25 }] },
  "Islam Studies": { religion: "islam", parts: CQ_MCQ },
  "Hindu Religion": { religion: "hindu", parts: CQ_MCQ },
  "Buddhist Religion": { religion: "buddhist", parts: CQ_MCQ },
  "Christian Religion": { religion: "christian", parts: CQ_MCQ },
  Physics: { groups: ["science"], parts: WITH_PRAC },
  Chemistry: { groups: ["science"], parts: WITH_PRAC },
  Biology: { groups: ["science"], parts: WITH_PRAC },
  "Bangladesh & Global Studies": { groups: ["science"], parts: CQ_MCQ },
  "General Science": { groups: ["business", "humanities"], parts: CQ_MCQ },
  Accounting: { groups: ["business"], parts: CQ_MCQ },
  "Finance & Banking": { groups: ["business"], parts: CQ_MCQ },
  "Business Entrepreneurship": { groups: ["business"], parts: CQ_MCQ },
  History: { groups: ["humanities"], parts: CQ_MCQ },
  Geography: { groups: ["humanities"], parts: CQ_MCQ },
  Civics: { groups: ["humanities"], parts: CQ_MCQ },
  "Higher Math": { groups: ["science"], optional: true, parts: WITH_PRAC },
  "Agriculture Studies": { optional: true, parts: WITH_PRAC },
};
// The rules a new Class 9–10 subject starts with.
export const defaultRule = (level, subject) => (level >= 9 && level <= 10 && SSC_RULES[subject] ? JSON.parse(JSON.stringify(SSC_RULES[subject])) : null);

// ---------- who takes which subject ----------
export const sectionGroup = (cls, section) => cls?.sectionMeta?.[section]?.group || null;
// Does this student take this subject? Subjects without a rule are for everyone.
export function takesSubject(student, cls, subject) {
  const rule = cls?.subjectRules?.[subject];
  if (!rule) return true;
  const group = sectionGroup(cls, student.section);
  if (rule.groups?.length && !rule.groups.includes(group)) return false;
  if (rule.religion && rule.religion !== student.religion) return false;
  if (rule.optional && student.optional !== subject) return false;
  return true;
}
// Is a subject only for some students of a section (religion or 4th subject)?
export const isElective = (cls, subject) => { const r = cls?.subjectRules?.[subject]; return !!(r?.religion || r?.optional); };
export const isOptionalSubject = (cls, subject) => !!cls?.subjectRules?.[subject]?.optional;
// The 4th-subject choices open to a section's group.
export const optionalChoices = (cls, section) => (cls?.subjects || []).filter((s) => {
  const r = cls.subjectRules?.[s];
  return r?.optional && (!r.groups?.length || r.groups.includes(sectionGroup(cls, section)));
});
// Two subjects can share a period when no student takes both: different
// religions, or different 4th subjects.
export function canShareSlot(cls, a, b) {
  if (a === b) return false;
  const ra = cls?.subjectRules?.[a], rb = cls?.subjectRules?.[b];
  return !!((ra?.religion && rb?.religion && ra.religion !== rb.religion) || (ra?.optional && rb?.optional));
}

// ---------- GPA ----------
// rows: [{ point, optional, failed }], one per subject with marks.
// Returns { gpa, failed }: an F in any compulsory subject means GPA 0.
export function gpaOf(rows) {
  const main = rows.filter((r) => !r.optional), extra = rows.find((r) => r.optional);
  if (!main.length) return { gpa: null, failed: false };
  if (main.some((r) => r.failed)) return { gpa: 0, failed: true };
  const bonus = extra && !extra.failed ? Math.max(0, Number(extra.point) - 2) : 0;
  const gpa = (main.reduce((s, r) => s + Number(r.point), 0) + bonus) / main.length;
  return { gpa: Math.min(5, gpa), failed: false };
}

// ---------- school week & shifts ----------
// A shift's periods are worked out from its start, period length and gaps,
// with one longer break after period `breakAfter` (0 = no break).
export const SHIFT_IDS = ["morning", "day"];
export const SHIFT_DEFAULTS = {
  morning: { id: "morning", name: "Morning shift", start: "07:00", length: 40, gap: 5, count: 5, breakAfter: 3, breakLength: 15 },
  day: { id: "day", name: "Day shift", start: "08:00", length: 45, gap: 5, count: 6, breakAfter: 3, breakLength: 20 },
};
export const DEFAULT_SCHEDULE = { days: [0, 1, 2, 3, 4], shifts: [SHIFT_DEFAULTS.day] }; // Sunday–Thursday
export const minutesOf = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; };
export const hhmmOf = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
export function periodsOf(shift) {
  const out = [];
  let at = minutesOf(shift.start);
  for (let i = 1; i <= shift.count; i++) {
    out.push([hhmmOf(at), hhmmOf(at + shift.length)]);
    at += shift.length + (i === shift.breakAfter ? shift.breakLength : shift.gap);
  }
  return out;
}
// The stored schedule, filled in with defaults and each shift's periods.
export function scheduleOf(stored) {
  const days = Array.isArray(stored?.days) && stored.days.length ? [...stored.days].sort((a, b) => a - b) : DEFAULT_SCHEDULE.days;
  const list = Array.isArray(stored?.shifts) && stored.shifts.length ? stored.shifts : DEFAULT_SCHEDULE.shifts;
  const shifts = list.map((s) => { const x = { ...SHIFT_DEFAULTS[s.id] ?? SHIFT_DEFAULTS.day, ...s }; return { ...x, periods: periodsOf(x) }; });
  return { days, shifts };
}
// Problems with a schedule an admin entered (English, for t()), or "".
export function scheduleProblem(s) {
  const days = s?.days, shifts = s?.shifts;
  if (!Array.isArray(days) || !days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(days).size !== days.length) return "Pick at least one school day.";
  if (!Array.isArray(shifts) || !shifts.length || shifts.length > SHIFT_IDS.length) return "Set up one or two shifts.";
  if (new Set(shifts.map((x) => x.id)).size !== shifts.length || shifts.some((x) => !SHIFT_IDS.includes(x.id))) return "Set up one or two shifts.";
  for (const x of shifts) {
    if (!x.name || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.start)) return "Each shift needs a name and a start time.";
    const ok = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    if (!ok(x.count, 1, 12)) return "A shift has 1 to 12 periods.";
    if (!ok(x.length, 20, 120)) return "A period lasts 20 to 120 minutes.";
    if (!ok(x.gap, 0, 30) || !ok(x.breakLength, 0, 90) || !ok(x.breakAfter, 0, x.count - 1)) return "Check the gaps and the break.";
    if (minutesOf(periodsOf(x).at(-1)[1]) >= 24 * 60) return "A shift has to end before midnight.";
  }
  return "";
}
export const shiftById = (schedule, id) => schedule.shifts.find((s) => s.id === id) || schedule.shifts[0];
export const shiftOfSection = (schedule, cls, section) => shiftById(schedule, cls?.sectionMeta?.[section]?.shift);
// Do two [start, end] periods (maybe from different shifts) overlap?
export const periodsOverlap = (a, b) => minutesOf(a[0]) < minutesOf(b[1]) && minutesOf(b[0]) < minutesOf(a[1]);

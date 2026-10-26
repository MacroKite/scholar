// Scholar — demo school data.
// Generated relative to the day the database is first set up, then stored in
// Postgres. "Reset demo data" (admin) regenerates it.

import { CLASS_WORDS, JUNIOR, SENIOR, DEFAULT_GRADING, isoOf, addDays, shiftSchoolDays } from "./calendar.js";
import { SHIFT_DEFAULTS, scheduleOf, shiftOfSection, defaultRule, defaultParts, takesSubject, isElective } from "./rules.js";

// Two shifts: Classes One–Five in the morning, Six–Ten in the day shift.
const SCHEDULE = { days: [0, 1, 2, 3, 4], shifts: [{ ...SHIFT_DEFAULTS.morning }, { ...SHIFT_DEFAULTS.day, start: "12:00" }] };
// Classes 9–10: each section is one group.
const GROUP_OF = { "c9|A": "science", "c9|B": "business", "c10|A": "science", "c10|B": "humanities" };
// Subjects nobody on the staff lists as their own are covered by these teachers.
const COVER = { "Islam Studies": ["mjd", "srd"], "Business Entrepreneurship": ["mfr", "nbg"], Civics: ["asr", "lmr"], "Bangladesh & Global Studies": ["lmr", "asr"] };

// Small seeded random so the demo school is the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// `today` is the school's local date.
export function seedSchool({ today = isoOf(new Date()) } = {}) {
  const R = rng(20261018);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const year = today.slice(0, 4);

  // ----- Teachers -----
  const T = [
    ["tnr", "Tania Rahman", "Mathematics"], ["kzr", "Kazi Zahir Rahman", "Mathematics"], ["mhs", "Mehedi Hasan", "Mathematics"],
    ["mch", "Mahfuza Chowdhury", "Biology"], ["rhn", "Rakib Hasan", "Physics"], ["fam", "Farzana Ameen", "Chemistry"],
    ["shm", "Shamim Hossain", "Higher Math"], ["sak", "Sadia Akter", "English"], ["jbr", "Jubayer Rahman", "English"],
    ["nsl", "Nafisa Sultana", "English"], ["nis", "Nusrat Islam", "Bangla"], ["abk", "Abul Kalam", "Bangla"],
    ["rkh", "Rokeya Khatun", "Bangla"], ["imh", "Imran Hossain", "ICT"], ["tsk", "Tasnim Kabir", "ICT"],
    ["shb", "Shahriar Babu", "General Science"], ["lnf", "Lutfun Nahar Ferdous", "General Science"],
    ["lmr", "Lamia Rahman", "Social Science"], ["asr", "Asif Rahman", "Social Science"],
    ["mjd", "Mohammad Jahid", "Religion"], ["srd", "Sharmin Rashid", "Religion"],
    ["pkd", "Pradip Kumar Das", "Hindu Religion"], ["sbr", "Suchana Barua", "Buddhist Religion"], ["jgm", "Joseph Gomes", "Christian Religion"],
    ["mfr", "Mostafizur Rahman", "Accounting"], ["nbg", "Nasima Begum", "Finance & Banking"],
    ["anh", "Anisul Haque", "History"], ["rma", "Ruma Akter", "Geography"], ["gmf", "Golam Mostafa", "Agriculture Studies"],
  ];
  const teachers = T.map(([id, name, subject], i) => ({
    id, name, subject, initials: id.toUpperCase(),
    email: `${name.split(" ")[0].toLowerCase()}.${id}@scholar.school`,
    phone: `+880 17${String(10000000 + Math.floor(R() * 89999999)).slice(0, 8)}`,
    joined: `${2012 + (i % 12)}-0${1 + (i % 9)}-15`,
  }));

  // ----- Classes & sections -----
  const classes = CLASS_WORDS.map((w, i) => {
    const id = `c${i + 1}`, level = i + 1, subjects = level >= 9 ? [...SENIOR] : [...JUNIOR];
    const sectionMeta = Object.fromEntries(["A", "B"].map((sec) => [sec, { shift: level <= 5 ? "morning" : "day", ...(GROUP_OF[`${id}|${sec}`] ? { group: GROUP_OF[`${id}|${sec}`] } : {}) }]));
    const subjectRules = Object.fromEntries(subjects.map((sub) => [sub, defaultRule(level, sub)]).filter(([, r]) => r));
    return { id, level, name: `Class ${w}`, short: w, year, sections: ["A", "B"], subjects, sectionMeta, subjectRules, fee: 1200 + 150 * level };
  });
  const classOf = (id) => classes.find((c) => c.id === id);
  const schedule = scheduleOf(SCHEDULE);

  // ----- Students -----
  const FIRST_M = ["Ayaan", "Rafid", "Tahmid", "Nafis", "Zarif", "Arian", "Fahim", "Sakib", "Mahir", "Rayan", "Ishraq", "Tanvir", "Adib", "Samin", "Nabil"];
  const FIRST_F = ["Ananya", "Nusaiba", "Raisa", "Tasfia", "Maliha", "Sumaiya", "Nabila", "Ayesha", "Fariha", "Sadia", "Lamisa", "Prova", "Zara", "Mithila", "Orpa"];
  const LAST = ["Karim", "Rahman", "Hossain", "Ahmed", "Chowdhury", "Islam", "Sarkar", "Uddin", "Haque", "Mahmud", "Kabir", "Talukder", "Siddique", "Akter", "Bhuiyan"];
  const GUARD_M = ["Kamal", "Jamal", "Habib", "Rashed", "Faruk", "Mizan", "Shahin", "Sohel", "Anwar", "Belal"];
  const GUARD_F = ["Nadia", "Shirin", "Rehana", "Salma", "Nasrin", "Farhana", "Rupa", "Lipi", "Mousumi", "Tahmina"];
  // Names for students of other religions: [boys, girls, surnames, guardians].
  const NAMES = {
    hindu: [["Arnab", "Pritom", "Sourav", "Joy", "Anik"], ["Ananya", "Prova", "Mithila", "Orpa", "Trisha"], ["Das", "Saha", "Roy", "Paul", "Ghosh"], ["Sujit", "Mala", "Gopal", "Rina"]],
    buddhist: [["Ujjwal", "Rupam"], ["Sraboni", "Ankhi"], ["Barua", "Chakma"], ["Bimal", "Shikha"]],
    christian: [["Ryan", "Shuvo"], ["Elina", "Megha"], ["Gomes", "Rozario", "Costa"], ["Peter", "Rita"]],
  };
  // Nine A has a Hindu and a Christian student, so its religion classes split.
  const FORCED = { "c9|A|4": "hindu", "c9|A|9": "christian" };
  const students = [];
  let n = 0;
  classes.forEach((c) => c.sections.forEach((sec) => {
    const size = c.id === "c9" && sec === "A" ? 14 : 7;
    for (let r = 1; r <= size; r++) {
      n++;
      const female = R() < 0.5;
      const x = R();
      let religion = FORCED[`${c.id}|${sec}|${r}`] ?? (x < 0.86 ? "islam" : x < 0.96 ? "hindu" : x < 0.98 ? "buddhist" : "christian");
      const [fm, ff, fl, fg] = NAMES[religion] ?? [FIRST_M, FIRST_F, LAST, [...GUARD_M, ...GUARD_F]];
      let first = female ? pick(ff) : pick(fm);
      let last = pick(fl);
      let guardian = `${pick(fg)} ${last}`;
      // The demo student and parent persona.
      if (c.id === "c9" && sec === "A" && r === 1) { first = "Ayaan"; last = "Karim"; guardian = "Nadia Karim"; religion = "islam"; }
      // Classes 9–10: a 4th subject open to the section's group (Science
      // mostly takes Higher Math).
      const optional = c.level < 9 ? null : c.sectionMeta[sec].group === "science" && (R() < 0.7 || first === "Ayaan") ? "Higher Math" : "Agriculture Studies";
      const born = Number(year) - 5 - c.level;
      students.push({
        id: `s${String(n).padStart(3, "0")}`, name: `${first} ${last}`, roll: r, classId: c.id, section: sec,
        gender: female && first !== "Ayaan" ? "Female" : "Male", guardian, religion, optional,
        phone: `+880 18${String(10000000 + Math.floor(R() * 89999999)).slice(0, 8)}`,
        dob: `${born}-${String(1 + Math.floor(R() * 12)).padStart(2, "0")}-${String(1 + Math.floor(R() * 27)).padStart(2, "0")}`,
        admitted: `${Number(year) - Math.floor(R() * 4)}-01-0${1 + Math.floor(R() * 8)}`,
        ability: 0.45 + R() * 0.5,
      });
    }
  }));
  const ayaan = students.find((s) => s.name === "Ayaan Karim");
  ayaan.ability = 0.82;

  // ----- What each section studies -----
  // A section's weekly "slots": one subject each, except that religion
  // classes and 4th subjects run side by side for the students who take them.
  const slotsOf = {};
  const sectionsOrder = [];
  [9, 10, 8, 7, 6, 5, 4, 3, 2, 1].forEach((lv) => ["A", "B"].forEach((sec) => sectionsOrder.push([`c${lv}`, sec])));
  sectionsOrder.forEach(([cid, sec]) => {
    const c = classOf(cid), studs = students.filter((x) => x.classId === cid && x.section === sec);
    const taken = c.subjects.filter((sub) => studs.some((x) => takesSubject(x, c, sub)));
    const together = (key) => taken.filter((sub) => c.subjectRules[sub]?.[key]);
    slotsOf[`${cid}|${sec}`] = [...taken.filter((sub) => !isElective(c, sub)).map((sub) => [sub]), ...[together("religion"), together("optional")].filter((x) => x.length)];
  });

  // ----- Who teaches what: one teacher per section and subject -----
  const pools = { ...COVER };
  teachers.forEach((t) => { (pools[t.subject] ||= []).push(t.id); });
  const turn = {};
  const assign = {}; // "c9|A|Mathematics" -> teacherId
  sectionsOrder.forEach(([cid, sec]) => {
    slotsOf[`${cid}|${sec}`].flat().forEach((sub) => {
      const pool = pools[sub]; turn[sub] = (turn[sub] || 0);
      assign[`${cid}|${sec}|${sub}`] = pool[turn[sub]++ % pool.length];
    });
  });

  // ----- Timetable: every period of each section's shift, no teacher double-booked -----
  // The two shifts don't overlap in time, so each is planned on its own.
  const timetable = [];
  let ttid = 0;
  schedule.shifts.forEach((shift) => {
    const secs = sectionsOrder.filter(([cid, sec]) => shiftOfSection(schedule, classOf(cid), sec).id === shift.id);
    schedule.days.forEach((day) => shift.periods.forEach((_, p) => {
      const busy = new Set();
      secs.forEach(([cid, sec], si) => {
        const c = classOf(cid), slots = slotsOf[`${cid}|${sec}`];
        const free = (list) => list.every((x) => !busy.has(x.tid)) && new Set(list.map((x) => x.tid)).size === list.length;
        let chosen = null;
        for (let k = 0; k < slots.length && !chosen; k++) {
          const slot = slots[(day * 3 + p + si + k) % slots.length].map((sub) => ({ sub, tid: assign[`${cid}|${sec}|${sub}`] }));
          if (free(slot)) chosen = slot;
        }
        if (!chosen) {
          // Everyone usual is busy: any free teacher of the subject covers it.
          for (const [sub] of slots.filter((x) => x.length === 1)) { const tid = pools[sub].find((t) => !busy.has(t)); if (tid) { chosen = [{ sub, tid }]; break; } }
        }
        if (!chosen) return;
        const room = `${c.level}0${sec === "A" ? 1 : 2}`;
        chosen.forEach((x, i) => {
          busy.add(x.tid);
          timetable.push({ id: `tt${++ttid}`, day, period: p, classId: cid, section: sec, subject: x.sub, teacherId: x.tid, room: i ? `${room}-${i + 1}` : room });
        });
      });
    }));
  });

  // ----- Class teachers: one per section, who takes its attendance -----
  // Tania looks after Nine A (the demo student's section); every other
  // section gets the teacher with the most periods there, spreading the
  // role so most teachers have one section.
  const classTeachers = { "c9|A": "tnr" };
  const hasSection = new Set(["tnr"]);
  sectionsOrder.forEach(([cid, sec]) => {
    const key = `${cid}|${sec}`;
    if (classTeachers[key]) return;
    const counts = {};
    timetable.filter((x) => x.classId === cid && x.section === sec).forEach((x) => { counts[x.teacherId] = (counts[x.teacherId] || 0) + 1; });
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t]) => t);
    classTeachers[key] = ranked.find((t) => !hasSection.has(t)) || ranked[0];
    hasSection.add(classTeachers[key]);
  });

  // ----- Attendance: the last 30 school days (today is left to the teacher) -----
  const classRate = { c1: .94, c2: .91, c3: .62, c4: .88, c5: .84, c6: .68, c7: .92, c8: .9, c9: .88, c10: .71 };
  const attendance = {};
  let day = today;
  for (let i = 0; i < 30; i++) {
    day = shiftSchoolDays(day, -1);
    classes.forEach((c) => c.sections.forEach((sec) => {
      const marks = {};
      students.filter((s) => s.classId === c.id && s.section === sec).forEach((s) => {
        const rate = Math.min(.99, classRate[c.id] + (s.ability - .7) * .25);
        const x = R();
        marks[s.id] = x < rate ? (R() < .07 ? "L" : "P") : "A";
      });
      attendance[`${day}|${c.id}|${sec}`] = marks;
    }));
  }

  // ----- Exams -----
  const exams = [];
  let eid = 0;
  const halfYear = shiftSchoolDays(addDays(today, -125), 0);
  const annual = shiftSchoolDays(today, 24);
  // Every subject someone in the class takes. In Classes 9–10 ICT is a
  // 50-mark paper, and the big exams are split into each subject's parts.
  classes.forEach((c) => c.subjects.filter((sub) => students.some((x) => x.classId === c.id && takesSubject(x, c, sub))).forEach((sub, i) => {
    const fullMarks = c.level >= 9 && sub === "ICT" ? 50 : 100, parts = defaultParts(c.subjectRules[sub], fullMarks);
    exams.push({ id: `e${++eid}`, term: "Half-Yearly Examination", subject: sub, classId: c.id, date: shiftSchoolDays(halfYear, i), start: "10:00", fullMarks, parts });
    exams.push({ id: `e${++eid}`, term: "Annual Examination", subject: sub, classId: c.id, date: shiftSchoolDays(annual, i), start: "10:00", fullMarks, parts });
  }));
  // A monthly test that's just happened (marks partly pending) and a class test coming up.
  const monthly = shiftSchoolDays(today, -4);
  ["c9", "c10", "c8"].forEach((cid) => ["Mathematics", "English", "Bangla"].forEach((sub, i) =>
    exams.push({ id: `e${++eid}`, term: "Monthly Test — October", subject: sub, classId: cid, date: shiftSchoolDays(monthly, -i), start: "13:00", fullMarks: 50, parts: [] })));
  ["Mathematics", "Physics", "Chemistry"].forEach((sub, i) => ["c9", "c10"].forEach((cid) =>
    exams.push({ id: `e${++eid}`, term: "Class Test 4", subject: sub, classId: cid, date: shiftSchoolDays(today, 3 + i), start: "12:50", fullMarks: 25, parts: [] })));

  // ----- Marks -----
  const marks = {}; // examId -> { studentId: { value, parts? } }
  exams.filter((e) => e.date < today).forEach((e) => {
    const m = {}, c = classOf(e.classId);
    students.filter((s) => s.classId === e.classId && takesSubject(s, c, e.subject)).forEach((s) => {
      // Monthly test Mathematics: Tania hasn't entered her sections yet.
      if (e.term.startsWith("Monthly") && e.subject === "Mathematics" && assign[`${s.classId}|${s.section}|Mathematics`] === "tnr") return;
      // Part marks swing more, so a few students fail one part (an F in the subject).
      const score = (full, swing = .3) => Math.round(full * Math.max(.18, Math.min(1, s.ability + (R() - .5) * swing)));
      if (!e.parts.length) { m[s.id] = { value: score(e.fullMarks) }; return; }
      const parts = Object.fromEntries(e.parts.map((p) => [p.key, score(p.full, .55)]));
      m[s.id] = { value: Object.values(parts).reduce((a, b) => a + b, 0), parts };
    });
    marks[e.id] = m;
  });

  // ----- Fees: one tuition bill per month from January -----
  const fees = {}; // studentId -> { "2026-03": { paidOn, method } | null }
  const thisMonth = today.slice(0, 7);
  const months = [];
  for (let m = 1; m <= Number(thisMonth.slice(5)); m++) months.push(`${year}-${String(m).padStart(2, "0")}`);
  students.forEach((s) => {
    fees[s.id] = {};
    months.forEach((ym, i) => {
      const last = i === months.length - 1, prev = i === months.length - 2;
      const unpaid = s.id === ayaan.id ? last : R() < (last ? .42 : prev ? .1 : .025);
      fees[s.id][ym] = unpaid ? null : { paidOn: `${ym}-${String(2 + Math.floor(R() * 9)).padStart(2, "0")}`, method: pick(["bKash", "Cash", "Bank transfer", "Nagad"]) };
    });
  });

  // ----- Homework -----
  const homework = [];
  let hid = 0;
  const HW = {
    Mathematics: [["Algebraic expressions", "Solve exercise 3.2, problems 1–15. Show every step and simplify fully."], ["Sets and functions", "Exercise 2.1: questions 4, 7, 9 and 12. Draw Venn diagrams where needed."], ["Ratio and proportion", "Complete the worksheet handed out in class. Bring it on the due date."]],
    Physics: [["Motion", "Read chapter 2 and answer the review questions 1–10 in your notebook."]],
    Chemistry: [["Periodic table", "Make a chart of the first 20 elements with their electron configuration."]],
    Biology: [["Cell division", "Draw and label the stages of mitosis. One page, neat diagrams."]],
    English: [["Paragraph writing", "Write a paragraph (150 words) on 'A rainy day in Dhaka'."]],
    "Higher Math": [["Geometric constructions", "Construct the triangles in exercise 1.3 (a) to (d) with compass and ruler."]],
    Bangla: [["রচনা: আমার প্রিয় শিক্ষক", "২০০ শব্দের মধ্যে রচনা লেখো।"]],
    ICT: [["Number systems", "Convert the 10 numbers on page 41 from decimal to binary and hexadecimal."]],
  };
  const addHw = (cid, sec, sub, k, assignedAgo, dueIn) => {
    const [topic, details] = HW[sub][k % HW[sub].length];
    const hw = { id: `h${++hid}`, classId: cid, section: sec, subject: sub, teacherId: assign[`${cid}|${sec}|${sub}`], topic, details, assigned: addDays(today, -assignedAgo), due: addDays(today, dueIn), submissions: {} };
    students.filter((s) => s.classId === cid && s.section === sec && takesSubject(s, classOf(cid), sub)).forEach((s) => {
      if (dueIn < 0 ? R() < .85 : R() < .45) hw.submissions[s.id] = { on: addDays(today, -Math.floor(R() * 2)), reviewed: dueIn < -3 };
    });
    homework.push(hw);
    return hw;
  };
  [["Mathematics", 0, 5, 3], ["Physics", 0, 4, 2], ["Chemistry", 0, 6, -2], ["Biology", 0, 3, 5], ["English", 0, 8, -4], ["Higher Math", 0, 2, 6], ["ICT", 0, 6, 1], ["Mathematics", 1, 10, -6]]
    .forEach(([sub, k, ago, due]) => addHw("c9", "A", sub, k, ago, due));
  const ayaanHw = homework.filter((h) => h.classId === "c9" && h.section === "A");
  ayaanHw.forEach((h) => { if (h.due < today) h.submissions[ayaan.id] = { on: addDays(h.due, -1), reviewed: h.due < addDays(today, -3) }; else delete h.submissions[ayaan.id]; });
  // Tania's other sections: work waiting to be reviewed.
  Object.entries(assign).filter(([, t]) => t === "tnr").forEach(([key], i) => {
    const [cid, sec] = key.split("|");
    if (cid === "c9" && sec === "A") return;
    if (i < 4) addHw(cid, sec, "Mathematics", i, 7, -1 - i);
  });

  // ----- Notices -----
  const notices = [
    [-1, "Parent–Teacher Meeting for Classes Six to Ten", "The parent–teacher meeting for Classes Six to Ten will be held on Thursday from 10:00 AM in the school auditorium. Guardians are requested to attend with the student diary."],
    [-3, "Annual Examination routine published", `The routine for the Annual Examination ${year} has been published. Exams start on ${annual}. Students must collect admit cards from the office by next week.`],
    [-6, "Tuition fee deadline for this month", "Monthly tuition fees must be paid by the 10th. Payments can be made in cash at the accounts office or through bKash / Nagad."],
    [-9, "Inter-school science fair", "Students of Classes Eight to Ten interested in the inter-school science fair should register with their science teacher. Projects are due in two weeks."],
    [-14, "Holiday notice", "The school will remain closed for the national holiday. Classes resume as usual on the next school day."],
    [-20, "Annual sports day", "Annual sports day will take place on the school field. Practice sessions run every Tuesday and Thursday after the last period."],
  ].map(([ago, topic, body], i) => ({ id: `n${i + 1}`, number: `${year}${String(120 - i * 7).padStart(3, "0")}`, date: addDays(today, ago), topic, body, audience: "Everyone" }));

  return {
    version: 1,
    seededOn: today,
    role: "admin",
    settings: { adminName: "Abdullah Al Maruf", adminEmail: "marufabdullah319@gmail.com", school: "Scholar Model School", year, threshold: 75 },
    schedule: SCHEDULE,
    personas: { teacher: "tnr", student: ayaan.id },
    grading: JSON.parse(JSON.stringify(DEFAULT_GRADING)),
    published: { "Half-Yearly Examination": true, "Monthly Test — October": false },
    teachers, classes, students, timetable, classTeachers, attendance, exams, marks, fees, homework, notices,
    reminders: {},
  };
}

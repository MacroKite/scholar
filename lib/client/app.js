// Scholar — academic management in the MacroKite style. The browser side:
// pages are drawn from template strings into the shell that
// components/ScholarApp.js renders. Three roles (Admin, Teacher, Student)
// see different pages; who you are comes from the signed-in account.
// Data lives in Postgres: every change is posted to /api/actions, then the
// fresh state is loaded back from /api/state.
// All text goes through t() (lib/i18n), in English or Bangla.

import { CLASS_NAMES, JUNIOR, SENIOR, DEFAULT_GRADING, addDays, isSchoolDay as onSchoolDays, shiftSchoolDays as shiftOnSchoolDays } from "../school/calendar.js";
import { GROUPS, GROUP_LABELS, RELIGIONS, RELIGION_LABELS, PART_KEYS, PART_LABELS, PART_SHORT, SHIFT_DEFAULTS, passMark, failedParts, defaultParts, partsProblem, takesSubject, isElective, isOptionalSubject, optionalChoices, sectionGroup, canShareSlot, gpaOf, periodsOf, scheduleProblem, shiftOfSection, periodsOverlap, minutesOf } from "../school/rules.js";
import { FEATURES } from "../school/features.js";
import { resultOf, gradeForPointIn, byMerit, planPromotion, nextClassOf } from "../school/results.js";
import { makeT, LANG_COOKIE, toLatinDigits } from "../i18n/index.js";
import { SCHOOL_TYPES, SCHOOL_TYPE_LABELS, websiteChecklist } from "../school/website.js";

// ---------- state ----------
let state = null; // set by start(), replaced after every change
let loadedAt = 0;
const ui = {}; // per-view filters (not saved)
let t = makeT("en"); // the current language; see setLanguage()

async function api(url, body) {
  const res = await fetch(url, body === undefined
    ? { cache: "no-store" }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) { location.href = "/login"; throw new Error(t("You've been signed out.")); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t("Something went wrong. Try again."));
  return data;
}
async function reload() { state = await api("/api/state"); loadedAt = Date.now(); }
// Run a server action, then reload so every page sees the change. Throws
// with the server's message if it was refused.
async function mutate(op, input = {}) {
  await flushPrefs();
  const { result } = await api("/api/actions", { op, input });
  await reload();
  return result || {};
}
// For buttons outside a form: run it, then redraw; errors show as a toast.
async function act(op, input, done) {
  try { const result = await mutate(op, input); done?.(result); } catch (e) { toast(e.message, { title: t("Couldn't save") }); }
  route();
}
// Per-user UI memory (read notifications, open nav groups),
// saved in the background shortly after it changes.
let prefsTimer, prefsPending = null;
function savePrefs() {
  state.readNotifs = state.readNotifs.slice(-300);
  prefsPending = { readNotifs: state.readNotifs, navOpen: state.navOpen };
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(flushPrefs, 400);
}
async function flushPrefs() {
  clearTimeout(prefsTimer);
  const input = prefsPending;
  prefsPending = null;
  if (input) await api("/api/actions", { op: "prefs.update", input }).catch(() => {});
}

// ---------- language ----------
// The choice lives in a cookie, so the server (sign-in pages, error
// messages) uses it too.
function useLanguage(lang) {
  t = makeT(lang);
  document.documentElement.lang = t.lang;
  // The shell's fixed labels (components/ScholarApp.js).
  $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$("[data-i18n-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nLabel)); el.title = t(el.dataset.i18nLabel); });
  const btn = $("#langToggle");
  if (btn) { btn.textContent = t.lang === "bn" ? "EN" : "বাং"; btn.title = t.lang === "bn" ? "Switch to English" : "বাংলায় দেখুন"; }
}
// In Bangla every number on screen is shown in Bangla digits, converted as
// the page is drawn (views, modals, toasts, the bell). Things people type
// back stay in Latin digits: they're wrapped in latin() (usernames, codes,
// IDs, phone numbers, emails), and form fields are never touched.
const latin = (html) => `<span data-latin>${html}</span>`;
const SKIP_DIGITS = "[data-latin], script, style, textarea, input, select";
function localizeDigits(node) {
  if (t.lang !== "bn") return;
  if (node.nodeType === Node.TEXT_NODE) {
    if (/[0-9]/.test(node.data) && !node.parentElement?.closest(SKIP_DIGITS)) node.data = t.digits(node.data);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.closest(SKIP_DIGITS)) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/[0-9]/.test(n.data) && !n.parentElement.closest(SKIP_DIGITS)) n.data = t.digits(n.data);
  [node, ...node.querySelectorAll("[title]")].forEach((el) => { if (el.title && !el.closest("[data-latin]")) el.title = t.digits(el.title); });
}
new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(localizeDigits))).observe(document.body, { childList: true, subtree: true });

function setLanguage(lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  useLanguage(lang);
  route();
}

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => state.today; // the school's date, from the server
// Optional features the school has turned on (Settings → Optional features).
const feature = (key) => !!state.features?.[key];
const thisMonth = () => today().slice(0, 7);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const money = (n) => `৳${Math.round(n).toLocaleString("en-IN")}`;
const dateObj = (iso) => new Date(iso + "T00:00:00");
const fmtDate = (iso) => dateObj(iso).toLocaleDateString(t.locale, { day: "numeric", month: "short", year: "numeric" });
const fmtDay = (iso) => dateObj(iso).toLocaleDateString(t.locale, { weekday: "short", day: "numeric", month: "short" });
const fmtMonth = (ym) => dateObj(ym + "-01").toLocaleDateString(t.locale, { month: "long", year: "numeric" });
const shortMonth = (d) => d.toLocaleDateString(t.locale, { month: "short" });
// 0 = Sunday. 1 January 2023 was a Sunday.
const dayName = (i, style = "long") => new Date(2023, 0, 1 + i).toLocaleDateString(t.locale, { weekday: style });
const t12 = (hhmm) => t.time(hhmm);
function daysBetween(a, b) { return Math.round((dateObj(b) - dateObj(a)) / 86400000); }
function relDay(iso) {
  const d = daysBetween(today(), iso);
  if (d === 0) return t("Today");
  if (d === 1) return t("Tomorrow");
  if (d === -1) return t("Yesterday");
  return d > 0 ? t("In {n} days", { n: d }) : t("{n} days ago", { n: -d });
}
const initials = (name) => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const hue = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 5; };
const avatar = (name, key = name, cls = "") => `<div class="avatar c${hue(key)} ${cls}" title="${esc(name)}">${esc(initials(name))}</div>`;
// Words from the school's data, in the current language where known.
const L = (text) => t.data(text);
const subj = (name) => t.data(name);
const term = (name) => t.term(name);

// ---------- icons ----------
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="4"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4V3h6v1"/><path d="M9 11h6M9 15h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M19 8v6M16 11h6"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M7 6V5a2 2 0 0 1 2-2h8"/>',
  chart: '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="6" width="3" height="12" rx="1"/><rect x="16" y="14" width="3" height="4" rx="1"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/>',
  board: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
  cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
};
const icon = (name, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[name] || ""}</svg>`;
const plus = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const check = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const xIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const searchIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
const chevDown = `<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
const arrowLeft = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;
const arrowUR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>`;

// ---------- doodle illustrations (quick-action cards) ----------
// Hand-drawn style: thick rounded ink lines, soft accent fills, little faces.
// Classes: w = card-coloured fill, f = accent fill, k = ink dot.
const eyes = (x1, x2, y) => `<circle class="k" cx="${x1}" cy="${y}" r="1.5"/><circle class="k" cx="${x2}" cy="${y}" r="1.5"/>`;
const ILLUSTRATIONS = {
  // A happy student in a graduation cap, with a plus sparkle.
  student: `<path class="w" d="M18 35c0-8 6-13 14-13s14 5 14 13c0 9-6 17-14 17s-14-8-14-17z"/>
    <path class="f" d="M7 22 32 12l25 10-25 10z"/>
    <path d="M51 24.5v9"/><circle class="k" cx="51" cy="35.5" r="2"/>
    ${eyes(27, 37, 38)}<path d="M28 43c2.2 2.6 5.8 2.6 8 0"/>
    <path d="M55 45h7M58.5 41.5v7"/><path d="M8 41l-3.5-1M9.5 48l-3 2.5"/>`,
  // A teacher (head and shoulders with a collar) in front of a board. Kept
  // simple so it stays clean at small sizes.
  teacher: `<rect class="f" x="31" y="7" width="27" height="21" rx="4.5"/>
    <path d="M36.5 14h11M36.5 20h15"/>
    <path class="w" d="M7 58c0-9.5 6.7-15 16-15s16 5.5 16 15z"/>
    <path d="M18 44.2l5 5.8 5-5.8"/>
    <circle class="w" cx="23" cy="30" r="9.5"/>
    <path class="f" d="M13.6 29c.6-6.3 4.6-10 9.8-10 4.8 0 8.4 3 9.1 7.6-3.8.1-8.4-1.1-11.2-4-1.7 3.1-4.5 5.4-7.7 6.4z"/>`,
  // Three stacked blocks: class, sections, subjects.
  classes: `<rect class="f" x="16" y="8" width="32" height="13" rx="4.5"/>
    <rect class="w" x="11" y="19" width="42" height="14" rx="4.5"/>
    <rect class="f" x="6" y="31" width="52" height="22" rx="6"/>
    <path d="M24 42h16"/>
    <path d="M56 11l3.5-3.5M58 18h4.5M52 5l1-3.5"/><path d="M5 22l-2.5-2M4 28H1"/>`,
  // A new class card with a plus, a second card peeking out behind it.
  addClass: `<rect class="w" x="15" y="8" width="36" height="30" rx="6" transform="rotate(-8 33 23)"/>
    <rect class="f" x="9" y="17" width="42" height="36" rx="7"/>
    <path d="M30 27v16M22 35h16"/>
    <path d="M55 13l3.5-3.5M57.5 20h4.5M51.5 7l1-3.5"/>`,
  // Every class at a glance: a 2 × 2 grid of class tiles.
  allClasses: `<rect class="f" x="7" y="7" width="22" height="22" rx="6"/>
    <rect class="w" x="35" y="7" width="22" height="22" rx="6"/>
    <rect class="w" x="7" y="35" width="22" height="22" rx="6"/>
    <rect class="f" x="35" y="35" width="22" height="22" rx="6"/>
    <path d="M41 15h10M41 20.5h6M13 43h10M13 48.5h6"/>`,
  // An exam sheet with ticks and a pencil, with a starburst.
  exam: `<path class="f" stroke="none" d="M50 2l2.3 6.2 6.4-2-3 6 6 2.8-6.4 2 1.8 6.4-6-3-3.2 5.8-1.6-6.4-6.6.8 4-5.2-5.2-4 6.6-.6-.4-6.6 5.4 3.8z"/>
    <g transform="rotate(-6 25 30)"><rect class="w" x="8" y="10" width="30" height="42" rx="5"/>
      <path d="M14 21l3 3 5-6M26 21.5h7M14 31l3 3 5-6M26 31.5h7M15 42h15"/></g>
    <g transform="rotate(32 46 38)"><rect class="f" x="40" y="20" width="12" height="30" rx="3"/>
      <path class="w" d="M40 50l6 9 6-9z"/><path d="M40 26.5h12"/></g>`,
};
const illustration = (name) => `<svg class="ill" viewBox="0 0 64 64" aria-hidden="true">${ILLUSTRATIONS[name]}</svg>`;

// ---------- lookups ----------
const getClass = (id) => state.classes.find((c) => c.id === id);
const getTeacher = (id) => state.teachers.find((x) => x.id === id);
const getStudent = (id) => state.students.find((s) => s.id === id);
const getExam = (id) => state.exams.find((e) => e.id === id);
const sortedClasses = () => [...state.classes].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
const className = (cid) => { const c = getClass(cid); return c ? L(c.name) : t("Removed class"); };
const classShort = (cid) => L(getClass(cid)?.short ?? "");
const classLabel = (cid, sec) => `${className(cid)}${sec ? ` · ${sec}` : ""}`;
const sectionStudents = (cid, sec) => state.students.filter((s) => s.classId === cid && (!sec || s.section === sec)).sort((a, b) => a.roll - b.roll);
const allSections = () => sortedClasses().flatMap((c) => c.sections.map((sec) => [c.id, sec]));
const childOf = () => getStudent(state.personas.student);
// Does a student take an exam's subject (their group, religion, 4th subject)?
// Classmates a family sees are anonymous, so for religion and 4th-subject
// exams it goes by whether they have a mark.
function takesExam(s, e) {
  const c = getClass(s.classId);
  if (s.anonymous && isElective(c, e.subject)) return state.marks[e.id]?.[s.id] !== undefined;
  return takesSubject(s, c, e.subject);
}
const takes = (s, subject) => takesSubject(s, getClass(s.classId), subject);
// The students of a section who take a subject.
const subjectStudents = (cid, sec, subject) => sectionStudents(cid, sec).filter((s) => takes(s, subject));
const groupOf = (cid, sec) => sectionGroup(getClass(cid), sec);
const groupLabel = (g) => (g ? t(GROUP_LABELS[g]) : "");
const religionLabel = (r) => t(RELIGION_LABELS[r] ?? r);
const meTeacher = () => getTeacher(state.personas.teacher);

// ---------- roles & people ----------
const ROLES = {
  admin: { label: "Admin", icon: "shield" },
  teacher: { label: "Teacher", icon: "board" },
  student: { label: "Student", icon: "cap" },
};
// Who's signed in, as a person key: "admin", "t:<teacher id>" or "s:<student id>".
// A student's account is shared with their guardian.
const meKey = () => ({ admin: "admin", teacher: `t:${state.personas.teacher}`, student: `s:${state.personas.student}` })[state.role];
function personName(key) {
  if (key === "admin") return state.settings.adminName;
  const [k, id] = key.split(":");
  if (k === "t") return getTeacher(id)?.name ?? t("Former teacher");
  return getStudent(id)?.name ?? t("Former student");
}
function personRole(key) {
  if (key === "admin") return t("Principal · {school}", { school: state.settings.school });
  const [k, id] = key.split(":");
  if (k === "t") return t("{subject} teacher", { subject: subj(getTeacher(id)?.subject ?? "") });
  const s = getStudent(id);
  if (!s) return "";
  return t("{class} · Roll {roll}", { class: classLabel(s.classId, s.section), roll: s.roll });
}
const firstName = (key) => personName(key).split(" ")[0];

// What each teacher teaches: [{classId, section, subject}]
function teachingOf(tid) {
  const seen = new Map();
  state.timetable.filter((x) => x.teacherId === tid).forEach((x) => seen.set(`${x.classId}|${x.section}|${x.subject}`, { classId: x.classId, section: x.section, subject: x.subject }));
  return [...seen.values()].sort((a, b) => (getClass(a.classId)?.level ?? 0) - (getClass(b.classId)?.level ?? 0) || a.section.localeCompare(b.section));
}
function teacherSections(tid) {
  const m = new Map();
  teachingOf(tid).forEach((x) => m.set(`${x.classId}|${x.section}`, [x.classId, x.section]));
  return [...m.values()];
}
// Class teachers: each section's class teacher takes its attendance.
const classTeacherId = (cid, sec) => state.classTeachers?.[`${cid}|${sec}`] ?? null;
const classTeacherOf = (tid) => allSections().filter(([c, s]) => classTeacherId(c, s) === tid);
const unassignedSections = () => allSections().filter(([c, s]) => !classTeacherId(c, s));
const sectionsLabel = (secs) => secs.map(([c, s]) => `${classShort(c)} ${s}`).join(", ");
// Sections a teacher teaches or is class teacher of.
function mySections(tid) {
  const m = new Map([...teacherSections(tid), ...classTeacherOf(tid)].map(([c, s]) => [`${c}|${s}`, [c, s]]));
  return allSections().filter(([c, s]) => m.has(`${c}|${s}`));
}
const takenByName = (who) => (who === "admin" ? t("the office") : getTeacher(who)?.name ?? t("a former teacher"));
const subjectTeacher = (cid, sec, subject) => {
  const counts = {};
  state.timetable.filter((x) => x.classId === cid && x.section === sec && x.subject === subject).forEach((x) => { counts[x.teacherId] = (counts[x.teacherId] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? getTeacher(top[0]) : null;
};

// ---------- grading & results ----------
const SCALES = {
  gpa5: { label: "GPA 5.0 (SSC / HSC)", ranges: DEFAULT_GRADING.ranges },
  gpa4: { label: "GPA 4.0", ranges: [
    { start: 90, end: 100, grade: "A", point: 4 }, { start: 80, end: 89, grade: "B", point: 3 },
    { start: 70, end: 79, grade: "C", point: 2 }, { start: 60, end: 69, grade: "D", point: 1 }, { start: 0, end: 59, grade: "F", point: 0 }] },
  letter: { label: "Letter grades (A–F)", ranges: [
    { start: 85, end: 100, grade: "A", point: "" }, { start: 70, end: 84, grade: "B", point: "" },
    { start: 55, end: 69, grade: "C", point: "" }, { start: 40, end: 54, grade: "D", point: "" }, { start: 0, end: 39, grade: "F", point: "" }] },
  custom: { label: "Custom", ranges: null },
};
function gradeFor(percent) {
  const p = Math.round(percent);
  const ranges = state.grading.ranges;
  const r = ranges.find((x) => p >= Number(x.start) && p <= Number(x.end)) || ranges[ranges.length - 1];
  return r || { grade: "–", point: 0 };
}
function gradeTone(grade) {
  const ranges = [...state.grading.ranges].sort((a, b) => b.start - a.start);
  const i = ranges.findIndex((r) => r.grade === grade);
  if (i < 0) return "";
  if (i === ranges.length - 1) return "g-fail";
  if (i === 0) return "g-top";
  return i <= Math.floor((ranges.length - 1) / 2) ? "g-mid" : "g-low";
}
const gradeTag = (g) => `<span class="grade ${gradeTone(g)}">${esc(t.grade(g))}</span>`;
const hasPoints = () => state.grading.ranges.some((r) => r.point !== "" && r.point != null);

const terms = () => [...new Set(state.exams.map((e) => e.term))].sort((a, b) => {
  const da = state.exams.filter((e) => e.term === a).map((e) => e.date).sort()[0];
  const db = state.exams.filter((e) => e.term === b).map((e) => e.date).sort()[0];
  return da.localeCompare(db);
});
// A student's result in a term (lib/school/results.js has the rules).
function studentResult(sid, termName) {
  const s = getStudent(sid), c = getClass(s.classId);
  const exams = state.exams.filter((e) => e.term === termName && e.classId === s.classId && takesExam(s, e)).sort((a, b) => a.date.localeCompare(b.date));
  return resultOf({ studentId: sid, cls: c, exams, marks: state.marks, markParts: state.markParts, ranges: state.grading.ranges });
}
const gradeForPoint = (gpa) => gradeForPointIn(state.grading.ranges, gpa);
function sectionRanking(cid, sec, termName) {
  return sectionStudents(cid, sec).map((s) => ({ s, r: studentResult(s.id, termName) }))
    .filter((x) => x.r.done > 0)
    .sort((a, b) => (b.r.gpa ?? 0) - (a.r.gpa ?? 0) || b.r.total - a.r.total);
}
const positionOf = (sid, termName) => { const s = getStudent(sid); const i = sectionRanking(s.classId, s.section, termName).findIndex((x) => x.s.id === sid); return i < 0 ? null : i + 1; };
const gpaText = (r) => (r.gpa === null ? "–" : r.gpa.toFixed(2));
const termHasMarks = (termName, cid) => state.exams.some((e) => e.term === termName && (!cid || e.classId === cid) && Object.keys(state.marks[e.id] || {}).length);

// ---------- attendance ----------
const attKey = (date, cid, sec) => `${date}|${cid}|${sec}`;
const MARK_LABEL = { P: "Present", A: "Absent", L: "Late" };
function attendanceOf(sid) {
  const s = getStudent(sid); if (!s) return [];
  return Object.entries(state.attendance)
    .filter(([k]) => k.endsWith(`|${s.classId}|${s.section}`))
    .map(([k, m]) => [k.slice(0, 10), m[sid]]).filter(([, v]) => v).sort((a, b) => a[0].localeCompare(b[0]));
}
const rateOf = (marks) => pct(marks.filter((v) => v !== "A").length, marks.length);
function studentRate(sid, days = 30) {
  const since = shiftSchoolDays(today(), -days);
  const list = attendanceOf(sid).filter(([d]) => d >= since).map(([, v]) => v);
  return list.length ? rateOf(list) : null;
}
// Days that have any attendance taken, newest first.
const recordedDays = () => [...new Set(Object.keys(state.attendance).map((k) => k.slice(0, 10)))].sort().reverse();
function classRate(cid, days = 7) {
  const dset = new Set(recordedDays().slice(0, days));
  const vals = Object.entries(state.attendance).filter(([k]) => dset.has(k.slice(0, 10)) && k.split("|")[1] === cid).flatMap(([, m]) => Object.values(m));
  return vals.length ? rateOf(vals) : null;
}

// ---------- schedule ----------
// The school's week and shifts (Settings). Each section belongs to a shift,
// and its periods' times come from that shift.
const schedule = () => state.schedule;
const isSchoolDay = (iso) => onSchoolDays(iso, schedule().days);
const shiftSchoolDays = (iso, n) => shiftOnSchoolDays(iso, n, schedule().days);
const multiShift = () => schedule().shifts.length > 1;
const shiftOf = (cid, sec) => shiftOfSection(schedule(), getClass(cid), sec);
const shiftName = (sh) => L(sh.name);
const entryShift = (x) => shiftOf(x.classId, x.section);
const spanOf = (x) => entryShift(x).periods[x.period];
const schoolDaysLabel = () => schedule().days.map((d) => dayName(d, "short")).join(", ");
// Today if it's a school day, otherwise the next one.
function scheduleDay() {
  const td = today();
  const d = isSchoolDay(td) ? td : shiftSchoolDays(td, 1);
  return { iso: d, dow: dateObj(d).getDay(), isToday: d === td };
}
// The period of a shift that's on right now, or -1.
function currentPeriod(shift) {
  if (!isSchoolDay(today())) return -1;
  const now = new Date(); const m = now.getHours() * 60 + now.getMinutes();
  return shift.periods.findIndex(([a, b]) => m >= minutesOf(a) && m <= minutesOf(b));
}
const isNow = (x) => scheduleDay().isToday && x.day === scheduleDay().dow && currentPeriod(entryShift(x)) === x.period;
const spanText = (span) => (span ? `${t12(span[0])} – ${t12(span[1])}` : "—");
const periodTime = (x) => spanText(spanOf(x));
const byTime = (a, b) => (spanOf(a)?.[0] ?? "").localeCompare(spanOf(b)?.[0] ?? "");

// ---------- fees ----------
// Charges are what a student owes (tuition every month, admission, session,
// exam fees…), less any discount; payments are money received, each with a
// receipt number, and can pay a charge in parts.
const FEE_KINDS = ["admission", "session", "exam", "other"];
const KIND_LABEL = { tuition: "Tuition", admission: "Admission fee", session: "Session fee", exam: "Exam fee", other: "Other fee" };
const net = (c) => c.amount - c.discount;
const dueOf = (c) => Math.max(0, net(c) - c.paid);
const chargesOf = (sid) => state.charges.filter((c) => c.studentId === sid);
const openChargesOf = (sid) => chargesOf(sid).filter((c) => dueOf(c) > 0).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
const studentDue = (sid) => sum(chargesOf(sid).map(dueOf));
const paymentsOf = (sid) => state.payments.filter((x) => x.studentId === sid);
const getCharge = (id) => state.charges.find((c) => c.id === id);
// "Tuition · October 2026", or a fee's own name (the usual ones translated).
function chargeLabel(c) {
  if (c.kind === "tuition") return t("Tuition · {month}", { month: fmtMonth(c.period) });
  const m = c.label.match(/^Session fee (\d{4})$/);
  return m ? t("Session fee {year}", { year: m[1] }) : L(c.label);
}
function chargeStatus(c) {
  if (!net(c)) return "free";
  if (!dueOf(c)) return "paid";
  if (c.paid) return "partial";
  return c.dueOn < today() ? "overdue" : "due";
}
const tuitionOf = (sid, ym) => state.charges.find((c) => c.studentId === sid && c.kind === "tuition" && c.period === ym);
const feeAmount = (s) => getClass(s.classId)?.fee ?? 0; // the class's monthly tuition, before any discount
const feeDue = (ym) => `${ym}-10`;
const feePill = (st) => ({
  paid: `<span class="pill green">${t("Paid")}</span>`, free: `<span class="pill plain">${t("Waived")}</span>`, partial: `<span class="pill blue">${t("Part paid")}</span>`,
  overdue: `<span class="pill red">${t("Overdue")}</span>`, due: `<span class="pill amber">${t("Unpaid")}</span>`,
})[st] ?? `<span class="pill">—</span>`;
const dueTag = (n) => (n ? `<span class="pill red">${money(n)}</span>` : `<span class="pill green">${t("Nothing due")}</span>`);
const discountText = (pc) => (pc >= 100 ? t("Free studentship") : pc ? t("{n}% tuition discount", { n: pc }) : "");

// ---------- homework ----------
// A family's homework: their section's, for subjects the student takes.
const myHomework = (s) => state.homework.filter((h) => h.classId === s.classId && h.section === s.section && takes(s, h.subject));
function hwStatus(h, sid) {
  const sub = h.submissions[sid];
  if (sub) return sub.reviewed ? "reviewed" : "submitted";
  return h.due < today() ? "missing" : "pending";
}
const hwPill = (st) => ({ reviewed: `<span class="pill green">${t("Reviewed")}</span>`, submitted: `<span class="pill blue">${t("Submitted")}</span>`, missing: `<span class="pill red">${t("Missing")}</span>`, pending: `<span class="pill amber">${t("Pending")}</span>` })[st];

// ---------- notifications (derived, per role) ----------
function notifications() {
  const td = today(), list = [];
  const add = (id, ic, html, meta, href) => list.push({ id: `${state.role}|${id}`, ic, html, meta, href });
  if (state.role === "admin") {
    const none = unassignedSections();
    if (none.length) add(`no-ct-${none.map((x) => x.join("")).join("-")}`, "alert", `<b>${t("{n} sections have no class teacher", { n: none.length })}</b>`, t("Only you can take their attendance"), "#/classes");
    sortedClasses().forEach((c) => { const r = classRate(c.id); if (r !== null && r < state.settings.threshold) add(`att-${c.id}-${recordedDays()[0]}`, "alert", t("<b>{name}</b> attendance is down to <b>{r}%</b>", { name: esc(L(c.name)), r }), t("Last 7 school days"), "#/dashboard"); });
    const unpaid = state.students.filter((s) => dueOf(tuitionOf(s.id, thisMonth()) ?? { amount: 0, discount: 0, paid: 0 }) > 0).length;
    if (unpaid) add(`fees-${thisMonth()}-${unpaid}`, "wallet", t("<b>{n} students</b> haven't paid {month} fees", { n: unpaid, month: fmtMonth(thisMonth()) }), t("Due {date}", { date: fmtDate(feeDue(thisMonth())) }), "#/fees");
  }
  if (state.role === "teacher") {
    teacherTasks().slice(0, 6).forEach((x) => add(`task-${x.key}`, x.ic, `<b>${esc(x.kind)}</b> — ${esc(x.detail)}`, t("Due {when}", { when: relDay(x.due) }), x.href));
  }
  if (state.role === "student") {
    const s = childOf();
    if (feature("homework")) myHomework(s).filter((h) => !h.submissions[s.id] && h.due >= td && daysBetween(td, h.due) <= 2)
      .forEach((h) => add(`hw-${h.id}`, "pencil", t("<b>{subject}</b> homework is due {when}", { subject: esc(subj(h.subject)), when: relDay(h.due) }), esc(h.topic), "#/homework"));
    state.exams.filter((e) => e.classId === s.classId && takesExam(s, e) && e.date >= td && daysBetween(td, e.date) <= 7)
      .forEach((e) => add(`ex-${e.id}`, "clipboard", `<b>${esc(subj(e.subject))}</b> ${esc(term(e.term))} · ${relDay(e.date)}`, `${fmtDay(e.date)} · ${t12(e.start)}`, "#/dashboard"));
    const owe = studentDue(s.id);
    if (owe) add(`fee-${owe}`, "wallet", t("<b>{amount}</b> in fees is due", { amount: money(owe) }), t("Pay at the school office or online"), "#/fees");
    const r = studentRate(s.id);
    if (r !== null && r < state.settings.threshold) add(`att-${s.id}`, "alert", t("Attendance is down to <b>{r}%</b>", { r }), t("Last 30 school days"), "#/attendance");
    Object.entries(state.published).filter(([, on]) => on).forEach(([tm]) => { if (termHasMarks(tm, s.classId)) add(`res-${tm}`, "award", t("<b>{term}</b> results are out", { term: esc(term(tm)) }), t("Tap to see the report"), "#/results"); });
  }
  state.notices.filter((n) => daysBetween(n.date, td) <= 3).forEach((n) => add(`notice-${n.id}`, "megaphone", t("New notice: <b>{topic}</b>", { topic: esc(n.topic) }), fmtDate(n.date), "#/notices"));
  return list;
}
const unreadNotifs = () => notifications().filter((n) => !state.readNotifs.includes(n.id)).length;

// ---------- teacher tasks ----------
function teacherTasks() {
  const tid = state.personas.teacher, td = today(), tasks = [];
  // Roll call is the class teacher's job: one task per section they look after.
  if (isSchoolDay(td)) {
    classTeacherOf(tid).forEach(([c, s]) => {
      if (!state.attendance[attKey(td, c, s)]) tasks.push({ key: `att-${c}|${s}-${td}`, ic: "check", kind: t("Attendance"), detail: t("Today's roll call"), section: classLabel(c, s), due: td, href: `#/attendance/${c}/${s}` });
    });
  }
  if (feature("homework")) state.homework.filter((h) => h.teacherId === tid).forEach((h) => {
    const n = Object.values(h.submissions).filter((s) => !s.reviewed).length;
    if (n) tasks.push({ key: `hw-${h.id}-${n}`, ic: "pencil", kind: t("Homework"), detail: t("Review {n} submissions · {topic}", { n, topic: h.topic }), section: classLabel(h.classId, h.section), due: h.due < td ? addDays(td, 1) : h.due, href: `#/homework/${h.id}` });
  });
  const mine = teachingOf(tid);
  state.exams.filter((e) => e.date < td).forEach((e) => {
    mine.filter((x) => x.classId === e.classId && x.subject === e.subject).forEach((x) => {
      const missing = subjectStudents(x.classId, x.section, e.subject).filter((s) => state.marks[e.id]?.[s.id] === undefined).length;
      if (missing) tasks.push({ key: `mk-${e.id}-${x.section}`, ic: "clipboard", kind: t("Enter marks"), detail: `${subj(e.subject)} · ${term(e.term)}`, section: classLabel(x.classId, x.section), due: addDays(e.date, 7), href: `#/marks/${e.id}/${x.section}` });
    });
  });
  return tasks.sort((a, b) => a.due.localeCompare(b.due));
}

// ---------- UI building blocks ----------
const greetWord = () => { const h = new Date().getHours(); return h < 12 ? t("Good morning") : h < 18 ? t("Good afternoon") : t("Good evening"); };
const todayLong = () => new Date().toLocaleDateString(t.locale, { weekday: "long", month: "long", day: "numeric" });
// Staff dashboards (classic look): a greeting banner with a drawing of a desk.
function staffHero(sub = "", cta = "") {
  return `<div class="card hero"><div class="hero-text"><div class="eyebrow">${todayLong()}</div>
    <h1 class="hero-title greet">${t("{greet}, {name}", { greet: greetWord(), name: esc(firstName(meKey())) })}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}${cta}</div>
    <svg class="ill hero-art" viewBox="0 0 230 140" aria-hidden="true">${DESK_ART}</svg></div>`;
}
// A desk with a screen, books, a mug and a plant, in the doodle style.
const DESK_ART = `<circle class="w" cx="46" cy="36" r="14"/><path d="M46 28v8l6 4"/>
  <rect class="w" x="150" y="14" width="44" height="30" rx="3"/><path d="M157 36l8-8 7 5 8-10 8 6"/>
  <path d="M14 112H216M34 112v22M196 112v22"/>
  <rect class="f" x="80" y="46" width="70" height="46" rx="5"/><rect class="w" x="88" y="54" width="54" height="30" rx="2"/><path d="M96 64h22M96 72h34M115 92v10M103 102h24"/>
  <rect class="f" x="34" y="100" width="38" height="12" rx="2"/><rect class="w" x="37" y="91" width="32" height="9" rx="2"/><rect class="f" x="41" y="83" width="26" height="8" rx="2"/>
  <rect class="w" x="160" y="90" width="16" height="22" rx="3"/><path d="M176 95c7 0 7 11 0 11M164 84c-3-5 3-7 0-12M171 84c-3-5 3-7 0-12"/>
  <path class="f" d="M186 92h22l-3 20h-16z"/><path class="w" d="M197 92c-7-14-13-18-17-26 12 2 18 12 17 26z"/><path class="w" d="M197 92c3-16 11-22 17-28 0 14-8 22-17 28z"/>
  <path class="f" stroke="none" d="M110 10l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path class="f" stroke="none" d="M22 64l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/>`;

// Student dashboard (friendly look): leaves, clouds and sparkles on the banner.
const leaf = (bx, by, ang, len, w) => {
  const a = (ang * Math.PI) / 180, tx = bx + len * Math.cos(a), ty = by - len * Math.sin(a);
  const mx = (bx + tx) / 2, my = (by + ty) / 2, nx = -Math.sin(a) * w, ny = -Math.cos(a) * w;
  return `M${bx} ${by}Q${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}Q${(mx - nx).toFixed(1)} ${(my - ny).toFixed(1)} ${bx} ${by}Z`;
};
const star = (cx, cy, r) => `M${cx} ${cy - r}L${cx + r * .28} ${cy - r * .28}L${cx + r} ${cy}L${cx + r * .28} ${cy + r * .28}L${cx} ${cy + r}L${cx - r * .28} ${cy + r * .28}L${cx - r} ${cy}L${cx - r * .28} ${cy - r * .28}Z`;
const BANNER_ART = (() => {
  const big = [[150, 70], [130, 96], [112, 116], [95, 126], [78, 112], [60, 92], [40, 66]].map(([a, l], i) => `<path class="l${(i % 3) + 1}" d="${leaf(70, 172, a, l, 15)}"/>`).join("");
  const small = [[122, 52], [102, 72], [80, 66], [58, 46]].map(([a, l], i) => `<path class="l${((i + 1) % 3) + 1}" d="${leaf(150, 172, a, l, 11)}"/>`).join("");
  const clouds = `<circle class="cl" cx="22" cy="162" r="26"/><circle class="cl2" cx="54" cy="172" r="22"/><circle class="cl" cx="118" cy="174" r="20"/>`;
  const stars = [[150, 42, 7, "sp"], [184, 86, 5, "sp2"], [122, 18, 4, "sp3"], [26, 34, 5, "sp2"], [190, 30, 3, "sp"]].map(([x, y, r, c]) => `<path class="${c}" d="${star(x, y, r)}"/>`).join("");
  return `<svg viewBox="0 0 200 170" aria-hidden="true">${big}${small}${clouds}${stars}</svg>`;
})();
const SPARK = `<svg class="spark" viewBox="0 0 12 12" aria-hidden="true"><path d="${star(6, 6, 6)}"/></svg>`;
function head(title, sub = "", actions = "", back = null) {
  return `${back ? `<a class="back" href="${back[0]}">${arrowLeft}${esc(back[1])}</a>` : ""}<div class="page-head"><div><h1 class="h1">${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;
}
function qa({ ic, ill, title, desc, href, action, data = "" }) {
  const inner = `${ill ? `<span class="qa-ill">${illustration(ill)}</span>` : `<span class="qa-icon">${icon(ic, "")}</span>`}<span class="t">${esc(title)}</span><span class="d">${esc(desc)}</span><span class="go">${arrowUR}</span>`;
  return href ? `<a class="card qa" href="${href}">${inner}</a>` : `<button type="button" class="card qa" data-action="${action}" ${data}>${inner}</button>`;
}
function table(cols, rows, empty = t("Nothing here yet."), id = "") {
  const th = cols.map((c) => Array.isArray(c) ? `<th class="${c[1]}">${c[0]}</th>` : `<th>${c}</th>`).join("");
  return `<div class="tbl-wrap"><table class="tbl" ${id ? `id="${id}"` : ""}><thead><tr>${th}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td class="empty-row" colspan="${cols.length}">${empty}</td></tr>`}</tbody></table></div>`;
}
const searchBox = (target, ph = t("Search"), sm = false) => `<label class="search ${sm ? "sm" : ""}">${searchIcon}<input type="search" placeholder="${esc(ph)}" data-search="${target}" /></label>`;
const seeAll = (href, label = t("View all")) => `<a class="btn sm" href="${href}">${label}</a>`;
function selectFilter(key, label, options, value) {
  const cur = options.find((o) => String(o[0]) === String(value)) || options[0];
  return `<label class="filter sm">${label} <b>${esc(cur[1])}</b>${chevDown}<select data-ui="${key}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
}
const seg = (key, options, value, cls = "") => `<div class="seg ${cls}">${options.map(([v, l]) => `<button type="button" class="${String(v) === String(value) ? "on" : ""}" data-ui-set="${key}" data-val="${esc(v)}">${l}</button>`).join("")}</div>`;
const emptyBox = (title, text, extra = "") => `<div class="empty"><b>${title}</b>${text}${extra ? `<div style="margin-top:14px">${extra}</div>` : ""}</div>`;
const classOptions = (all = true) => [...(all ? [["", t("All classes")]] : []), ...sortedClasses().map((c) => [c.id, L(c.name)])];
const termOptions = (list) => list.map((x) => [x, term(x)]);

function barChart(items, threshold) {
  const n = items.length;
  return `<div class="bars"><div class="bars-y"><span>100%</span><span>80%</span><span>60%</span><span>40%</span><span>20%</span><span>0%</span></div>
    <div class="bars-plot" style="--n:${n};--th:${threshold}%" title="${esc(t("Dashed line: {th}%", { th: threshold }))}">
      ${items.map((it, i) => it.value === null ? `<div class="bar" title="${esc(it.label)}: ${esc(t("no data"))}"></div>` : `<div class="bar ${it.value < threshold ? "low" : ""}" style="--h:${it.value}%" title="${esc(it.title || it.label)}: ${it.value}%"><span class="fill" style="height:${it.value}%;animation-delay:${i * 0.03}s"></span><span class="tip">${it.value}%</span></div>`).join("")}
    </div></div>
    <div class="bars-x" style="--n:${n}"><span></span>${items.map((it) => `<span>${esc(it.label)}</span>`).join("")}</div>`;
}
const meter = (p, cls = "") => `<div class="meter ${cls}"><span style="width:${Math.max(0, Math.min(100, p))}%"></span></div>`;
const inlineMeter = (p) => p === null ? `<span class="muted">—</span>` : `<div class="inline-meter">${meter(p, p < state.settings.threshold ? "red" : "green")}<b>${p}%</b></div>`;

// ---------- navigation ----------
const NAV = {
  admin: [
    { r: "dashboard", label: "Dashboard", ic: "grid" },
    { group: "academic", label: "Academic", ic: "book", items: [{ r: "classes", label: "Class Setup" }, { r: "grading", label: "Grading System" }, { r: "promotion", label: "Promotion" }] },
    { r: "timetable", label: "Timetable", ic: "calendar" },
    { r: "attendance", label: "Attendance", ic: "check" },
    { group: "exams", label: "Exams & Results", ic: "clipboard", items: [{ r: "exams", label: "Exams" }, { r: "results", label: "Results" }] },
    { r: "students", label: "Students", ic: "user" },
    { r: "teachers", label: "Teachers", ic: "users" },
    { r: "fees", label: "Fees & Payments", ic: "wallet" },
    { r: "notices", label: "Notice Board", ic: "megaphone" },
    { r: "sms", label: "SMS", ic: "chat" },
    { r: "website", label: "Website", ic: "globe" },
    { r: "settings", label: "Settings", ic: "sliders" },
  ],
  teacher: [
    { r: "dashboard", label: "Dashboard", ic: "grid" },
    { r: "attendance", label: "Attendance", ic: "check", when: () => classTeacherOf(state.personas.teacher).length > 0 },
    { r: "homework", label: "Homework", ic: "pencil", f: "homework" },
    { r: "exams", label: "Exams", ic: "clipboard" },
    { r: "timetable", label: "Timetable", ic: "calendar" },
    { r: "students", label: "Students", ic: "user" },
    { r: "notices", label: "Notice Board", ic: "megaphone" },
    { r: "settings", label: "Settings", ic: "sliders" },
  ],
  // One family account: the student's pages and the guardian's in one menu.
  student: [
    { r: "dashboard", label: "Dashboard", ic: "grid" },
    { r: "timetable", label: "Class Routine", ic: "calendar" },
    { r: "homework", label: "Homeworks", ic: "pencil", f: "homework" },
    { r: "attendance", label: "Attendance", ic: "check" },
    { r: "results", label: "Results", ic: "award" },
    { r: "reports", label: "Report Card", ic: "file" },
    { r: "fees", label: "Fees & Payments", ic: "wallet" },
    { r: "notices", label: "Notice Board", ic: "megaphone" },
    { r: "settings", label: "Settings", ic: "sliders" },
  ],
};
// Pages reached from inside another page highlight that page's nav item.
const ALIAS = { marks: "exams", receipt: "fees", print: "results" };
// The menu, minus pages of optional features that are turned off.
const navItems = (role = state.role) => NAV[role].filter((x) => (!x.f || feature(x.f)) && (!x.when || x.when()));
const allowedRoutes = (role = state.role) => navItems(role).flatMap((x) => x.items ? x.items.map((i) => i.r) : [x.r]);

function renderNav(active) {
  const link = (x, sub = false) => `<a href="#/${x.r}" class="${x.r === active ? "active" : ""}">${sub ? "" : icon(x.ic)}${esc(t(x.label))}</a>`;
  $("#nav").innerHTML = navItems().map((x) => {
    if (!x.items) return link(x);
    const inside = x.items.some((i) => i.r === active);
    const open = inside || state.navOpen[x.group];
    return `<button type="button" class="nav-group ${inside ? "in" : ""}" data-group="${x.group}" aria-expanded="${open ? "true" : "false"}">${icon(x.ic)}${esc(t(x.label))}${chevDown}</button>
      <div class="nav-sub" ${open ? "" : "hidden"}>${x.items.map((i) => link(i, true)).join("")}</div>`;
  }).join("");
}
function renderRoleSwitch() {
  $("#roleSwitch").innerHTML = `<div class="role-btn"><span class="role-ic">${icon(ROLES[state.role].icon, "")}</span><span class="role-txt"><small>${t("Signed in as")}</small><b>${t(ROLES[state.role].label)}</b></span></div>`;
}
function renderMe() {
  const k = meKey();
  $("#meName").textContent = personName(k);
  $("#meSub").textContent = personRole(k);
  const av = $("#meAvatar");
  av.className = `avatar c${hue(k)}`; av.textContent = initials(personName(k));
}
function updateBell() {
  const n = unreadNotifs(); const b = $("#bellBadge");
  b.hidden = !n; b.textContent = n > 9 ? "9+" : n;
}

// ---------- router ----------
const parseHash = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
let lastView = "";
function route() {
  let [name = "dashboard", ...params] = parseHash();
  const navName = ALIAS[name] || name;
  if (!allowedRoutes().includes(navName) || !VIEWS[name]) { name = "dashboard"; params = []; }
  const main = $("#view");
  const keep = lastView === location.hash ? main.scrollTop : 0;
  main.innerHTML = VIEWS[name](...params);
  main.scrollTop = keep;
  lastView = location.hash;
  renderNav(ALIAS[name] || name);
  renderRoleSwitch();
  renderMe();
  updateBell();
  MOUNTS[name]?.(main, ...params);
  document.body.classList.remove("nav-open");
  const navLabel = NAV[state.role].flatMap((x) => x.items || [x]).find((x) => x.r === (ALIAS[name] || name))?.label;
  document.title = `${navLabel ? t(navLabel) : "Scholar"} · Scholar`;
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

// ======================================================================
// VIEWS
// ======================================================================
const VIEWS = {};
const MOUNTS = {};

// ---------- Dashboard ----------
VIEWS.dashboard = () => ({ admin: dashAdmin, teacher: dashTeacher, student: dashStudent })[state.role]();

function upcomingExamsCard(student = null, limit = 60) {
  const td = today();
  const rows = state.exams.filter((e) => e.date >= td && (!student || (e.classId === student.classId && takesExam(student, e)))).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)).slice(0, limit);
  return `<div class="card card-pad">
    <div class="card-head"><span class="card-title">${t("Upcoming Exams")}</span><div class="tools">${searchBox("upExams", t("Search"), true)}${state.role === "admin" || state.role === "teacher" ? seeAll("#/exams") : ""}</div></div>
    <div class="scroll-y" style="max-height:520px">
    ${table([t("Subject"), t("Class"), t("Term"), [t("Date"), "r"]], rows.map((e) => `<tr data-s="${esc(`${subj(e.subject)} ${e.subject} ${className(e.classId)} ${term(e.term)} ${fmtDate(e.date)}`.toLowerCase())}">
      <td class="strong">${esc(subj(e.subject))}</td><td>${esc(classShort(e.classId))}</td><td class="t2">${esc(term(e.term))}</td><td class="r mono">${fmtDate(e.date)}<span class="sub-l">${relDay(e.date)} · ${t12(e.start)}</span></td></tr>`), t("No exams scheduled."), "upExams")}
    </div></div>`;
}

function dashAdmin() {
  const th = state.settings.threshold;
  const rates = sortedClasses().map((c) => ({ label: L(c.short || c.name), title: L(c.name), value: classRate(c.id) }));
  const low = rates.filter((r) => r.value !== null && r.value < th);
  const ym = thisMonth();
  const tu = state.charges.filter((c) => c.kind === "tuition" && c.period === ym);
  const collected = sum(tu.map((c) => Math.min(c.paid, net(c)))), expected = sum(tu.map(net));
  const owing = tu.filter((c) => dueOf(c) > 0).length, outstanding = sum(state.charges.map(dueOf));
  const sections = sum(state.classes.map((c) => c.sections.length));
  const noCt = unassignedSections();
  return `<div class="page">
    ${staffHero(t("Here's {school} today.", { school: esc(state.settings.school) }))}
    ${noCt.length ? `<div class="card card-pad notice-bar"><span class="item-tile">${icon("alert", "")}</span><div class="item-text"><span class="t">${esc(t("{n} sections have no class teacher: {list}", { n: noCt.length, list: sectionsLabel(noCt) }))}</span><span class="m">${t("Until one is assigned, only you can take their attendance.")}</span></div><a class="btn sm" href="#/classes">${t("Assign")}</a></div>` : ""}
    <div class="qa-grid">
      ${qa({ ill: "student", title: t("Add Student"), desc: t("Admit a new student into a class and section."), action: "add-student" })}
      ${qa({ ill: "teacher", title: t("Add Teacher"), desc: t("Add a teacher and the subject they teach."), action: "add-teacher" })}
      ${qa({ ill: "classes", title: t("Class Setup"), desc: t("Classes, sections and subjects for the year."), href: "#/classes" })}
      ${qa({ ill: "exam", title: t("Create Exam"), desc: t("Schedule an exam or class test."), action: "create-exam" })}
    </div>
    <div class="grid-main">
      <div class="stack">
        <div class="stats" style="margin:0">
          <a class="stat" href="#/students"><div class="n">${state.students.length.toLocaleString()}</div><div class="l">${t("Total students")}</div></a>
          <a class="stat" href="#/teachers"><div class="n">${state.teachers.length}</div><div class="l">${t("Total teachers")}</div></a>
          <a class="stat" href="#/classes"><div class="n">${state.classes.length}<small>${t("/ {n} sections", { n: sections })}</small></div><div class="l">${t("Total classes")}</div></a>
        </div>
        <div class="card card-pad" style="flex:1">
          <div class="card-head"><span class="card-title">${t("Attendance alert")}</span><button class="btn primary" style="height:40px" data-action="attendance-alert" ${low.length ? "" : "disabled"}>${t("Take action")}</button></div>
          <p class="card-sub">${low.length ? t("{list} are below the {th}% attendance threshold over the last 7 school days.", { list: `<b style="color:var(--danger-text)">${low.map((l) => esc(l.title)).join(", ")}</b>`, count: low.length, th }) : t("Every class is above the {th}% attendance threshold over the last 7 school days.", { th })}</p>
          ${barChart(rates, th)}
        </div>
      </div>
      ${upcomingExamsCard()}
    </div>
    <div class="grid-2 stretch">
      <div class="card card-pad">
        <div class="card-head"><span class="card-title">${t("Tuition collection")}</span><span class="pill-static">${fmtMonth(ym)}</span></div>
        <div class="meter-head"><span>${t("{a} of {b} collected", { a: money(collected), b: money(expected) })}</span><b>${pct(collected, expected)}%</b></div>
        ${meter(pct(collected, expected))}
        <div class="hint" style="margin-top:10px">${t("{n} students still to pay · due {date}", { n: owing, date: fmtDate(feeDue(ym)) })} · ${t("{amount} due in all", { amount: money(outstanding) })}</div>
        <div style="margin-top:20px">${seeAll("#/fees", t("Open fees"))}</div>
      </div>
      <div class="card card-pad">
        <div class="card-head"><span class="card-title">${t("Notice board")}</span><div class="tools">${seeAll("#/notices")}</div></div>
        <div class="list">${state.notices.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map(noticeItem).join("")}</div>
      </div>
    </div>
  </div>`;
}

function todaysClassesRows(entries, cols) {
  return entries.map((x) => `<tr class="${isNow(x) ? "hl" : ""}">${cols(x)}<td class="r mono">${periodTime(x)}${isNow(x) ? `<span class="now-tag">${t("Now")}</span>` : ""}</td></tr>`);
}
function scheduleTitle() { const d = scheduleDay(); return d.isToday ? t("Today's Classes") : t("{day}'s Classes", { day: dayName(d.dow) }); }
const notTodayNote = (d) => (d.isToday ? "" : `<p class="card-sub">${t("No classes today — here's {day}.", { day: fmtDay(d.iso) })}</p>`);

function dashTeacher() {
  const tid = state.personas.teacher;
  const d = scheduleDay();
  const mine = state.timetable.filter((x) => x.teacherId === tid && x.day === d.dow).sort(byTime);
  const tasks = teacherTasks();
  const secs = teacherSections(tid), ct = classTeacherOf(tid);
  const nStudents = sum(secs.map(([c, s]) => sectionStudents(c, s).length));
  const cards = [qa({ ic: "calendar", title: t("Class Routine"), desc: t("Your periods for the week, with rooms and times."), href: "#/timetable" })];
  if (ct.length) cards.push(qa({ ic: "check", title: t("Mark Attendance"), desc: t("Today's roll call for {list}.", { list: sectionsLabel(ct) }), href: "#/attendance" }));
  cards.push(qa({ ic: "clipboard", title: t("Enter Marks"), desc: t("Marks for exams and class tests that are over."), href: "#/exams" }));
  if (feature("homework")) cards.push(qa({ ic: "pencil", title: t("Add Homework"), desc: t("Set homework for one of your sections."), action: "add-homework" }));
  const sub = [esc(subj(meTeacher().subject)), t("{n} sections", { n: secs.length }), t("{n} students", { n: nStudents })];
  if (ct.length) sub.push(t("Class teacher of {list}", { list: esc(sectionsLabel(ct)) }));
  return `<div class="page">
    ${staffHero(sub.join(" · "), tasks.length ? `<a class="btn primary" href="${tasks[0].href}">${t("Next task: {task}", { task: esc(tasks[0].kind) })}</a>` : "")}
    <div class="qa-grid" style="--n:${Math.min(cards.length, 4)}">
      ${cards.join("")}
    </div>
    <div class="grid-2 stretch">
      <div class="card card-pad">
        <div class="card-head"><span class="card-title">${scheduleTitle()}</span>${seeAll("#/timetable")}</div>
        ${notTodayNote(d)}
        ${table([t("Subject"), t("Section"), t("Room"), [t("Time"), "r"]], todaysClassesRows(mine, (x) => `<td class="strong">${esc(subj(x.subject))}</td><td>${esc(classLabel(x.classId, x.section))}</td><td class="mono">${esc(x.room)}</td>`), t("No classes on this day."))}
      </div>
      <div class="card card-pad">
        <div class="card-head"><span class="card-title">${t("Pending Tasks")} ${tasks.length ? `<span class="nav-badge" style="margin:0">${tasks.length}</span>` : ""}</span></div>
        <div class="scroll-y">
        ${table([t("Task"), t("Section"), ["", "r"]], tasks.map((x) => `<tr><td class="strong">${esc(x.kind)}<span class="sub-l">${relDay(x.due)} · ${esc(x.detail)}</span></td><td class="nowrap">${esc(x.section)}</td><td class="r"><a class="btn sm" href="${x.href}">${t("Take action")}</a></td></tr>`), t("You're all caught up."))}
        </div>
      </div>
    </div>
  </div>`;
}

function studentHomeworkRows(s, { faculty = false, status = true, limit = 99 } = {}) {
  return myHomework(s)
    .sort((a, b) => b.due.localeCompare(a.due)).slice(0, limit).map((h) => {
      const st = hwStatus(h, s.id);
      return `<tr data-s="${esc(`${subj(h.subject)} ${h.subject} ${h.topic}`.toLowerCase())}"><td class="strong">${esc(subj(h.subject))}</td><td>${esc(h.topic)}</td>${faculty ? `<td class="mono">${esc(getTeacher(h.teacherId)?.initials ?? "—")}</td>` : ""}<td class="mono">${fmtDate(h.due)}<span class="sub-l">${relDay(h.due)}</span></td>${status ? `<td>${hwPill(st)}</td>` : ""}<td class="r"><button class="btn sm" data-action="hw-details" data-id="${h.id}">${t("Details")}</button></td></tr>`;
    });
}
function noticeItem(n) {
  const d = dateObj(n.date);
  return `<button type="button" class="item" data-action="notice" data-id="${n.id}"><span class="item-tile date"><b>${d.getDate()}</b><small>${shortMonth(d)}</small></span><span class="item-text"><span class="t">${esc(n.topic)}</span><span class="m">${t("No. {number}", { number: esc(n.number) })} · ${esc(L(n.audience))}</span></span></button>`;
}

function dashStudent() {
  const s = childOf(), d = scheduleDay(), td = today();
  const rate = studentRate(s.id);
  const lastTerm = [...terms()].reverse().find((tm) => state.published[tm] && termHasMarks(tm, s.classId));
  const res = lastTerm ? studentResult(s.id, lastTerm) : null;
  const pending = myHomework(s).filter((h) => ["pending", "missing"].includes(hwStatus(h, s.id))).length;
  const owe = studentDue(s.id);
  const mine = state.timetable.filter((x) => x.classId === s.classId && x.section === s.section && x.day === d.dow).sort(byTime);
  const notices = state.notices.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const ct = getTeacher(classTeacherId(s.classId, s.section));
  const sub = [esc(classLabel(s.classId, s.section)), t("Roll {roll}", { roll: s.roll })];
  if (groupOf(s.classId, s.section)) sub.push(esc(t("{group} group", { group: groupLabel(groupOf(s.classId, s.section)) })));
  if (ct) sub.push(t("Class teacher: {name}", { name: esc(ct.name) }));
  // What's next today.
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const next = d.isToday ? mine.find((x) => spanOf(x) && minutesOf(spanOf(x)[1]) > nowM) : mine[0];
  const line = !mine.length ? t("No classes today.")
    : next ? t(d.isToday ? "Next up: {subject} at {time}." : "First class on {day}: {subject} at {time}.", { subject: esc(subj(next.subject)), time: t12(spanOf(next)[0]), day: dayName(d.dow) })
    : t("That's all your classes for today.");
  // Coming up: exams, fees and homework, soonest first.
  const events = [
    ...state.exams.filter((e) => e.classId === s.classId && takesExam(s, e) && e.date >= td && daysBetween(td, e.date) <= 30)
      .map((e) => ({ date: e.date, title: subj(e.subject), meta: `${term(e.term)} · ${t12(e.start)}`, href: "#/dashboard" })),
    ...(owe ? [{ date: openChargesOf(s.id)[0].dueOn < td ? td : openChargesOf(s.id)[0].dueOn, title: t("Fees due"), meta: money(owe), href: "#/fees" }] : []),
    ...(feature("homework") ? myHomework(s).filter((h) => !h.submissions[s.id] && h.due >= td && daysBetween(td, h.due) <= 7).map((h) => ({ date: h.due, title: t("{subject} homework", { subject: subj(h.subject) }), meta: h.topic, href: "#/homework" })) : []),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const tone = (g) => { const x = gradeTone(g); return x === "g-mid" ? "" : x; };
  return `<div class="page"><div class="s-dash"><div class="s-main">
    <div class="banner"><div class="banner-art left">${BANNER_ART}</div><div class="banner-art right">${BANNER_ART}</div>
      <div class="banner-eyebrow">${todayLong()}</div>
      <h1 class="banner-title greet">${t("{greet}, {name}!", { greet: greetWord(), name: esc(firstName(meKey())) })}</h1>
      <p>${line}</p><p class="banner-sub sub">${sub.join(" · ")}</p>
      <a class="btn" href="#/timetable">${t("See class routine")}</a></div>
    <div class="shortcuts">
      <a class="shortcut" href="#/timetable"><span class="sc-ic">${icon("calendar", "")}</span><span class="sc-text"><span class="t">${t("Class Routine")}</span><span class="d">${t("{n} classes this week", { n: state.timetable.length })}</span></span>${chevDown}</a>
      <a class="shortcut" href="#/results"><span class="sc-ic">${icon("award", "")}</span><span class="sc-text"><span class="t">${t("Results")}</span><span class="d">${res ? `${t("GPA")} ${gpaText(res)} · ${esc(term(lastTerm))}` : t("no results yet")}</span></span>${chevDown}</a>
      <a class="shortcut" href="#/reports"><span class="sc-ic">${icon("file", "")}</span><span class="sc-text"><span class="t">${t("Report Card")}</span><span class="d">${t("Print your result card")}</span></span>${chevDown}</a>
    </div>
    <div class="stats" style="--n:${feature("homework") ? 4 : 3}">
      <a class="stat" href="#/attendance"><div class="n">${rate ?? "–"}<small>%</small></div><div class="l">${t("Attendance, last 30 days")}</div></a>
      <a class="stat" href="#/results"><div class="n">${res ? gpaText(res) : "–"}</div><div class="l">${t("GPA · {term}", { term: esc(lastTerm ? term(lastTerm) : t("no results yet")) })}</div></a>
      ${feature("homework") ? `<a class="stat" href="#/homework"><div class="n">${pending}</div><div class="l">${t("Homework not submitted")}</div></a>` : ""}
      <a class="stat" href="#/fees"><div class="n">${money(owe)}</div><div class="l">${t("Fees due")}</div></a>
    </div>
    <div class="grid-2 stretch">
      <div class="card card-pad">
        <div class="card-head"><span class="card-title">${scheduleTitle()}</span>${seeAll("#/timetable")}</div>
        ${notTodayNote(d)}
        ${table([t("Subject"), t("Faculty"), t("Room"), [t("Time"), "r"]], todaysClassesRows(mine, (x) => `<td class="strong">${esc(subj(x.subject))}</td><td class="mono">${esc(getTeacher(x.teacherId)?.initials ?? "—")}</td><td class="mono">${esc(x.room)}</td>`), t("No classes on this day."))}
      </div>
      <div class="card card-pad">
        <div class="card-head"><span class="card-title">${t("Your progress")}</span>${seeAll("#/results", t("More"))}</div>
        ${res ? `<p class="card-sub">${esc(term(lastTerm))}</p><div class="prog">${res.rows.filter((x) => x.got !== null).map((x) => `<div class="prog-row"><span class="nm">${esc(subj(x.subject))}</span><div class="pbar ${tone(x.grade)}"><span style="width:${Math.round(x.pct)}%"></span></div><span class="v">${Math.round(x.pct)}%</span></div>`).join("")}</div>`
          : emptyBox(t("No results yet"), t("Your marks for each subject show here once the school publishes them."))}
      </div>
    </div>
    ${feature("homework") ? `<div class="card card-pad">
      <div class="card-head"><span class="card-title">${t("Homeworks")}</span>${seeAll("#/homework")}</div>
      ${table([t("Subject"), t("Topic"), t("Submission"), t("Status"), ["", "r"]], studentHomeworkRows(s, { limit: 4 }), t("No homework right now."))}
    </div>` : ""}
    <div class="card card-pad">
      <div class="card-head"><span class="card-title">${t("Notice board")}</span>${seeAll("#/notices")}</div>
      <div class="list">${notices.map(noticeItem).join("") || `<div class="muted">${t("No notices yet.")}</div>`}</div>
    </div>
  </div>
  <aside class="rail"><div class="rail-head"><span>${t("Coming up")}</span></div>
    <div class="rail-list">${events.map((ev) => { const dd = dateObj(ev.date); return `<a class="event" href="${ev.href}"><div class="dow">${dayName(dd.getDay(), "short")}</div><div class="day">${String(dd.getDate()).padStart(2, "0")}</div><div class="t">${esc(ev.title)}</div><div class="m">${SPARK}${esc(ev.meta)}</div></a>`; }).join("") || emptyBox(t("Nothing coming up"), t("Exams, fees and homework due soon show here."))}</div>
  </aside></div></div>`;
}

// ---------- Class setup ----------
VIEWS.classes = (id) => {
  if (id) return classForm(id === "new" ? null : getClass(id));
  return `<div class="page">
    ${head(t("Class Setup"), t("Classes, sections and subjects for the {year} academic year.", { year: esc(state.settings.year) }))}
    <div class="qa-grid" style="--n:2">
      ${qa({ ill: "addClass", title: t("Add New Class"), desc: t("Create a class with its sections and subjects."), href: "#/classes/new" })}
      ${qa({ ill: "allClasses", title: t("All Classes"), desc: t("{n} classes · {m} sections", { n: state.classes.length, m: sum(state.classes.map((c) => c.sections.length)) }), action: "scroll-to", data: 'data-target="allClasses"' })}
    </div>
    <div class="card card-pad" id="allClasses">
      <div class="card-head"><span class="card-title">${t("All Classes")}</span>${searchBox("classTbl", t("Search classes"), true)}</div>
      ${table([t("Class"), t("Year"), t("Sections · class teacher"), t("Subjects"), [t("Students"), "num"], t("Monthly fee"), ["", "r"]], sortedClasses().map((c) => `<tr class="click" data-href="#/classes/${c.id}" data-s="${esc(`${L(c.name)} ${c.name} ${c.subjects.map(subj).join(" ")} ${c.subjects.join(" ")}`.toLowerCase())}">
        <td class="strong">${esc(L(c.name))}${sectionSummary(c) ? `<span class="sub-l">${esc(sectionSummary(c))}</span>` : ""}</td><td class="mono">${esc(c.year)}</td>
        <td>${c.sections.map((s) => { const ct = getTeacher(classTeacherId(c.id, s)); return `<span class="pill ${ct ? "plain" : "red"}" style="margin:0 4px 4px 0" title="${esc(ct ? t("Class teacher: {name}", { name: ct.name }) : t("No class teacher"))}">${esc(s)} · ${ct ? esc(ct.initials) : t("none")}</span>`; }).join("")}</td>
        <td class="t2">${c.subjects.length} <span class="sub-l">${esc(c.subjects.slice(0, 3).map(subj).join(", "))}${c.subjects.length > 3 ? "…" : ""}</span></td>
        <td class="num mono">${sectionStudents(c.id).length}</td><td class="mono">${money(c.fee)}</td>
        <td class="r"><a class="btn sm" href="#/classes/${c.id}">${t("Edit")}</a></td></tr>`), t("No classes yet."), "classTbl")}
    </div>
  </div>`;
};
// "A: Science · B: Business Studies", and the shift when the school has two.
const sectionSummary = (c) => c.sections.map((sec) => {
  const bits = [groupLabel(sectionGroup(c, sec)), multiShift() ? shiftName(shiftOf(c.id, sec)) : ""].filter(Boolean);
  return bits.length ? `${sec}: ${bits.join(", ")}` : "";
}).filter(Boolean).join(" · ");
const ALL_SUBJECTS = () => [...new Set([...JUNIOR, ...SENIOR, ...state.classes.flatMap((c) => c.subjects)])].sort();
const rowInput = (name, value, ph) => `<div class="row-input"><input class="input" name="${name}" value="${esc(value)}" placeholder="${esc(ph)}" ${name === "subject" ? 'list="subjectList"' : ""} /><button type="button" class="row-x" data-action="remove-row" aria-label="${esc(t("Remove"))}">${xIcon}</button></div>`;
function classForm(c) {
  const y = Number(state.settings.year);
  return `<div class="page narrow">
    ${head(c ? t("Edit {name}", { name: L(c.name) }) : t("Add New Class"), c ? t("Change sections, subjects or the monthly fee for {name}. Students and timetable stay as they are.", { name: esc(L(c.name)) }) : t("Pick the academic year and class, then add its sections and the subjects taught."), "", ["#/classes", t("Back")])}
    <form id="classForm" class="on-bg" autocomplete="off">
      <div class="builder">
        <div class="field"><label>${t("Select Academic Year")}</label><select class="select" name="year">${[y - 1, y, y + 1].map((v) => `<option ${String(v) === String(c?.year ?? y) ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field"><label>${t("Select Class")}</label><select class="select" name="name"><option value="">${t("Select class")}</option>${CLASS_NAMES.map((w) => `<option value="${w}" ${c && (c.short === w || c.name === `Class ${w}`) ? "selected" : ""}>${esc(L(`Class ${w}`))}</option>`).join("")}</select></div>
        <div class="col"><span class="lbl">${t("Add Section")}</span><div class="col" id="secRows">${(c?.sections ?? ["A"]).map((s) => rowInput("section", s, t("Section name"))).join("")}</div><button type="button" class="add-row" data-action="add-row" data-kind="section">${plus} ${t("Add Section")}</button></div>
        <div class="col"><span class="lbl">${t("Select subject")}</span><div class="col" id="subRows">${(c?.subjects ?? [""]).map((s) => rowInput("subject", s, t("Add subject"))).join("")}</div><button type="button" class="add-row" data-action="add-row" data-kind="subject">${plus} ${t("Add subject")}</button></div>
        <div class="field"><label>${t("Monthly tuition fee (৳)")}</label><input class="input" name="fee" type="number" min="0" step="50" value="${c?.fee ?? 1500}" /></div>
      </div>
      <datalist id="subjectList">${ALL_SUBJECTS().map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
      <div class="err" id="classErr" hidden></div>
      <div class="form-actions" style="margin-top:8px">
        <button class="btn primary">${t("Save")}</button>
        <button type="button" class="btn lg" data-action="class-preview">${t("Show Preview")}</button>
        ${c ? `<button type="button" class="btn danger lg" data-action="delete-class" data-id="${c.id}" style="margin-left:auto">${t("Delete class")}</button>` : ""}
      </div>
    </form>
    ${c ? `<div class="card panel" style="margin-top:22px"><h3>${t("Class teachers")}</h3><div class="desc">${t("Each section's class teacher takes its attendance and sees guardians' phone numbers. One teacher can look after several sections.")}</div>
      <div class="fields-2" style="margin-top:20px">${c.sections.map((s) => field(t("Section {s}", { s: esc(s) }), sel(`ct-${s}`, teacherChoices(), classTeacherId(c.id, s) ?? "", `data-ct="${esc(s)}"`))).join("")}</div>
      ${c.sections.length > 1 ? `<div style="margin-top:14px">${field(t("Same teacher for every section"), sel("ct-all", [["", t("Choose a teacher…")], ...teacherChoices().slice(1)], "", 'data-ct-all="1"'), t("Sets the class teacher of all sections at once."))}</div>` : ""}</div>` : ""}
    ${c ? sectionsPanel(c) : ""}
    ${c && (c.level >= 9 || Object.keys(c.subjectRules || {}).length) ? subjectRulesPanel(c) : ""}
  </div>`;
}
const isSenior = (c) => c.level >= 9 && c.level <= 10;
// Each section's shift and (Classes 9–10) group. Saved as soon as it changes.
function sectionsPanel(c) {
  const showGroup = isSenior(c) || c.sections.some((sec) => sectionGroup(c, sec));
  if (!multiShift() && !showGroup) return "";
  const desc = [multiShift() ? t("Which shift each section comes in. Its periods follow that shift's times.") : "", showGroup ? t("In Classes 9–10 each section is one group. Students take only their group's subjects.") : ""].filter(Boolean).join(" ");
  return `<div class="card panel" style="margin-top:22px"><h3>${t("Sections")}</h3><div class="desc">${desc}</div>
    <div class="fields-2" style="margin-top:20px">${c.sections.map((sec) => `<div class="col" style="gap:8px"><span class="lbl" style="margin:0">${t("Section {s}", { s: esc(sec) })}</span>
      ${multiShift() ? sel(`shift-${sec}`, schedule().shifts.map((sh) => [sh.id, shiftName(sh)]), shiftOf(c.id, sec).id, `data-sec-shift="${esc(sec)}" aria-label="${esc(t("Shift"))}"`) : ""}
      ${showGroup ? sel(`group-${sec}`, [["", t("No group")], ...GROUPS.map((g) => [g, groupLabel(g)])], sectionGroup(c, sec) ?? "", `data-sec-group="${esc(sec)}" aria-label="${esc(t("Group"))}"`) : ""}</div>`).join("")}</div></div>`;
}
// Who takes each subject, and how its exams split into parts.
function subjectRulesPanel(c) {
  const rules = c.subjectRules || {};
  const partOf = (r, k) => r?.parts?.find((x) => x.key === k)?.full ?? "";
  return `<form class="card panel" id="rulesForm" style="margin-top:22px" autocomplete="off"><h3>${t("Subjects: who takes them")}</h3>
    <div class="desc">${t("Tick the groups that take a subject (none ticked means every group). A religion subject is only for students of that religion. A 4th subject is chosen by each student; only its points above 2.00 count toward GPA. Parts set the usual exam split; a student must pass each part.")}</div>
    ${table([t("Subject"), t("Groups"), t("Religion"), t("4th subject"), ...PART_KEYS.map((k) => [esc(t(PART_SHORT[k])), "num"])], c.subjects.map((sub) => { const r = rules[sub]; return `<tr data-rule="${esc(sub)}">
      <td class="strong">${esc(subj(sub))}</td>
      <td class="nowrap">${GROUPS.map((g) => `<label class="mini-check"><input type="checkbox" name="g-${g}" ${r?.groups?.includes(g) ? "checked" : ""} />${esc(groupLabel(g))}</label>`).join("")}</td>
      <td>${sel("religion", [["", t("Everyone")], ...RELIGIONS.map((x) => [x, religionLabel(x)])], r?.religion ?? "", 'style="min-width:120px"')}</td>
      <td><input type="checkbox" class="checkbox" name="optional" aria-label="${esc(t("4th subject"))}" ${r?.optional ? "checked" : ""} /></td>
      ${PART_KEYS.map((k) => `<td class="num"><input class="input mono part-in" type="number" min="0" name="p-${k}" value="${partOf(r, k)}" placeholder="—" aria-label="${esc(t(PART_LABELS[k]))}" /></td>`).join("")}</tr>`; }))}
    <div class="err" id="rulesErr" hidden></div>
    <div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="btn primary">${t("Save subject rules")}</button></div></form>`;
}
function readRules(form) {
  return Object.fromEntries($$("[data-rule]", form).map((row) => {
    const v = (n) => row.querySelector(`[name="${n}"]`);
    const parts = PART_KEYS.map((k) => ({ key: k, full: Number(v(`p-${k}`).value) || 0 })).filter((x) => x.full > 0);
    return [row.dataset.rule, { groups: GROUPS.filter((g) => v(`g-${g}`).checked), religion: v("religion").value || null, optional: v("optional").checked, parts }];
  }));
}
const teacherChoices = () => [["", t("No class teacher")], ...state.teachers.map((x) => [x.id, `${x.name} (${x.initials})`])];
function readClassForm(form) {
  const vals = (n) => [...new Set($$(`[name="${n}"]`, form).map((i) => i.value.trim()).filter(Boolean))];
  return { year: form.year.value, short: form.name.value, sections: vals("section"), subjects: vals("subject"), fee: Number(form.fee.value) || 0 };
}
MOUNTS.classes = (root, id) => {
  const form = $("#classForm", root); if (!form) return;
  const c = id && id !== "new" ? getClass(id) : null;
  // Section shift and group save as soon as they change.
  $$("[data-sec-shift], [data-sec-group]", root).forEach((el) => el.addEventListener("change", () => {
    const sec = el.dataset.secShift ?? el.dataset.secGroup;
    const input = el.dataset.secShift ? { shift: el.value } : { group: el.value || null };
    act("section.set", { classId: c.id, section: sec, ...input }, (r) => toast(r.removed ? t("Section {s} saved. {n} periods outside the new shift were removed from the timetable.", { s: sec, n: r.removed }) : t("Section {s} saved", { s: sec })));
  }));
  $("#rulesForm", root)?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, err = $("#rulesErr", f);
    const rules = readRules(f);
    for (const [sub, r] of Object.entries(rules)) {
      if (r.religion && r.optional) { err.textContent = t("{subject} can't be both a religion subject and a 4th subject.", { subject: subj(sub) }); err.hidden = false; return; }
      const problem = r.parts.length ? partsProblem(r.parts, sum(r.parts.map((x) => x.full))) : "";
      if (problem) { err.textContent = `${subj(sub)}: ${t(problem)}`; err.hidden = false; return; }
    }
    whileBusy(f, async () => {
      try { await mutate("class.rules", { classId: c.id, rules }); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; return; }
      toast(t("Subject rules saved")); route();
    });
  });
  // Class teacher pickers save as soon as they change.
  $$("[data-ct], [data-ct-all]", root).forEach((el) => el.addEventListener("change", () => {
    if (el.dataset.ctAll && !el.value) return;
    const sections = el.dataset.ctAll ? c.sections : [el.dataset.ct];
    const list = sectionsLabel(sections.map((s) => [c.id, s]));
    act("classTeacher.set", { classId: c.id, sections, teacherId: el.value || null }, (r) =>
      toast(r.teacher ? t("{name} is class teacher of {list}", { name: r.teacher, list }) : t("{list} has no class teacher now", { list })));
  }));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = readClassForm(form), err = $("#classErr");
    const name = L(`Class ${v.short}`);
    const problem = !v.short ? t("Pick a class.") : !v.sections.length ? t("Add at least one section.") : !v.subjects.length ? t("Add at least one subject.")
      : state.classes.some((x) => x !== c && x.name === `Class ${v.short}` && x.year === v.year) ? t("{name} already exists for {year}. Edit it from All Classes instead.", { name, year: v.year })
      : c && c.sections.some((s) => !v.sections.includes(s) && sectionStudents(c.id, s).length) ? t("A section you removed still has students. Move them first.") : "";
    if (problem) { err.textContent = problem; err.hidden = false; return; }
    whileBusy(form, async () => {
      try { await mutate("class.save", { id: c?.id, ...v }); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; return; }
      toast(c ? t("{name} updated", { name }) : t("{name} added with {n} sections", { name, n: v.sections.length })); go("#/classes");
    });
  });
};

// ---------- Grading system ----------
VIEWS.grading = () => {
  const g = state.grading;
  return `<div class="page narrow">
    ${head(t("Grading System"), t("Choose a scale and set the mark range for each grade. Results across the school use this table."), "", ["#/dashboard", t("Back")])}
    <form id="gradeForm" class="on-bg" autocomplete="off">
      <div class="field" style="max-width:340px;margin-bottom:28px"><label>${t("Choose Scale")}</label>
        <select class="select" name="scale">${Object.entries(SCALES).map(([k, s]) => `<option value="${k}" ${k === g.scale ? "selected" : ""}>${esc(t(s.label))}</option>`).join("")}</select></div>
      <span class="lbl">${t("Grading range")}</span>
      <div class="grade-rows">
        <div class="grade-row grade-head"><span>${t("Start (%)")}</span><span>${t("End (%)")}</span><span>${t("Grade")}</span><span>${t("Point")}</span><span></span></div>
        <div id="gradeRows" class="grade-rows">${g.ranges.map(gradeRow).join("")}</div>
        <button type="button" class="add-row" data-action="add-grade">${plus} ${t("Add grade")}</button>
      </div>
      <div class="err" id="gradeErr" hidden></div>
      <div class="form-actions" style="margin-top:24px">
        <button class="btn primary">${t("Save")}</button>
        <button type="button" class="btn lg" data-action="grade-preview">${t("Show Preview")}</button>
      </div>
    </form>
  </div>`;
};
const gradeRow = (r = {}) => `<div class="grade-row"><input class="input" name="start" type="number" min="0" max="100" placeholder="${esc(t("Start"))}" value="${r.start ?? ""}" /><input class="input" name="end" type="number" min="0" max="100" placeholder="${esc(t("End"))}" value="${r.end ?? ""}" /><input class="input" name="grade" placeholder="${esc(t("Grade"))}" value="${esc(r.grade ?? "")}" /><input class="input" name="point" type="number" step="0.25" min="0" placeholder="—" value="${r.point ?? ""}" /><button type="button" class="row-x" data-action="remove-row" aria-label="${esc(t("Remove"))}">${xIcon}</button></div>`;
function readGrades(form) {
  return $$(".grade-row", $("#gradeRows", form)).map((row) => ({
    start: row.querySelector('[name="start"]').value, end: row.querySelector('[name="end"]').value,
    grade: row.querySelector('[name="grade"]').value.trim(), point: row.querySelector('[name="point"]').value,
  })).filter((r) => r.start !== "" || r.end !== "" || r.grade).map((r) => ({ start: Number(r.start), end: Number(r.end), grade: r.grade, point: r.point === "" ? "" : Number(r.point), _raw: r }));
}
function gradeProblem(ranges) {
  if (!ranges.length) return t("Add at least one grade.");
  for (const r of ranges) {
    if (r._raw.start === "" || r._raw.end === "" || !r.grade) return t("Every row needs a start, an end and a grade.");
    if (r.start < 0 || r.end > 100 || r.start > r.end) return t("{grade}: the range {start}–{end} isn't valid.", { grade: r.grade, start: r.start, end: r.end });
  }
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start <= sorted[i - 1].end) return t("{a} and {b} overlap.", { a: sorted[i - 1].grade, b: sorted[i].grade });
  if (new Set(ranges.map((r) => r.grade)).size !== ranges.length) return t("Two rows use the same grade.");
  return "";
}
function gradeGaps(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start); const gaps = [];
  let at = 0;
  sorted.forEach((r) => { if (r.start > at) gaps.push(`${at}–${r.start - 1}`); at = Math.max(at, r.end + 1); });
  if (at <= 100) gaps.push(`${at}–100`);
  return gaps;
}
MOUNTS.grading = (root) => {
  const form = $("#gradeForm", root);
  form.scale.addEventListener("change", () => {
    const preset = SCALES[form.scale.value].ranges;
    if (preset) $("#gradeRows").innerHTML = preset.map(gradeRow).join("");
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const ranges = readGrades(form), err = $("#gradeErr");
    const p = gradeProblem(ranges);
    if (p) { err.textContent = p; err.hidden = false; return; }
    const gaps = gradeGaps(ranges);
    whileBusy(form, async () => {
      try { await mutate("grading.save", { scale: form.scale.value, ranges: ranges.map(({ _raw, ...r }) => r) }); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; return; }
      err.hidden = true;
      toast(gaps.length ? t("Saved. Marks in {gaps} don't map to any grade yet.", { gaps: gaps.join(", ") }) : t("Grading system saved"));
    });
  });
};

// ---------- Timetable ----------
// One grid per shift: periods down, school days across. A cell can hold
// several subjects when religion classes or 4th subjects run side by side.
function ttGrid(shift, entries, { cell, edit = false, cls = null }) {
  const d = scheduleDay(), todayDow = d.isToday ? d.dow : -1, cur = currentPeriod(shift);
  const days = schedule().days;
  const colors = ["var(--accent)", "var(--blue)", "var(--green)", "var(--amber)", "var(--violet)"];
  const one = (x, now, attrs = "") => {
    const style = `style="--sc:${colors[hue(x.subject)]}"`;
    return edit ? `<button type="button" class="tt-cell ${now ? "now" : ""}" ${style} data-action="edit-period" ${attrs} data-id="${x.id}">${cell(x)}</button>` : `<div class="tt-cell ${now ? "now" : ""}" ${style}>${cell(x)}</div>`;
  };
  const rows = shift.periods.map((span, pi) => {
    const row = `<div class="tt-time"><b>${t("Period {n}", { n: pi + 1 })}</b>${t12(span[0])} – ${t12(span[1])}</div>` + days.map((day) => {
      const here = entries.filter((e) => e.day === day && e.period === pi).sort((a, b) => a.subject.localeCompare(b.subject));
      const now = day === todayDow && pi === cur;
      const at = `data-day="${day}" data-period="${pi}"`;
      if (!here.length) return edit ? `<button type="button" class="tt-cell free ${now ? "now" : ""}" data-action="edit-period" ${at}>${plus} ${t("Add")}</button>` : `<div class="tt-cell free ${now ? "now" : ""}">${t("Free")}</div>`;
      // Room for one more side-by-side subject?
      const more = edit && cls && cls.subjects.some((sub) => here.every((x) => canShareSlot(cls, x.subject, sub)));
      if (here.length === 1 && !more) return one(here[0], now, at);
      return `<div class="tt-multi">${here.map((x) => one(x, now, at)).join("")}${more ? `<button type="button" class="tt-add" data-action="edit-period" ${at} data-new="1">${plus} ${t("Side by side")}</button>` : ""}</div>`;
    }).join("");
    const brk = shift.breakAfter > 0 && pi === shift.breakAfter - 1 && pi < shift.periods.length - 1;
    return row + (brk ? `<div class="tt-break">${t("Break")} · ${t12(span[1])} – ${t12(shift.periods[pi + 1][0])}</div>` : "");
  }).join("");
  return `<div class="tt-wrap"><div class="tt" style="--days:${days.length}">
    <div></div>${days.map((day) => `<div class="tt-h ${day === todayDow ? "today" : ""}">${dayName(day)}</div>`).join("")}
    ${rows}
  </div></div>`;
}
// A teacher's week can span both shifts: one grid for each shift they teach in.
function ttByShift(entries, cell) {
  const used = schedule().shifts.filter((sh) => entries.some((e) => entryShift(e).id === sh.id));
  return (used.length ? used : [schedule().shifts[0]]).map((sh) => `<div class="card card-pad">${multiShift() ? `<div class="card-head"><span class="card-title">${esc(shiftName(sh))}</span><span class="pill-static">${spanText([sh.periods[0][0], sh.periods.at(-1)[1]])}</span></div>` : ""}
    ${ttGrid(sh, entries.filter((e) => entryShift(e).id === sh.id), { cell })}</div>`).join("");
}
VIEWS.timetable = () => {
  const role = state.role;
  let title = t("Timetable"), sub, controls = "", body;
  const room = (x) => t("Room {room}", { room: esc(x.room) });
  const modeSeg = (mode) => seg("ttMode", [["class", t("By class")], ["teacher", t("By teacher")]], mode, "sm");
  const shiftNote = (cid, sec) => (multiShift() ? ` ${esc(t("{shift}: {from} – {to}.", { shift: shiftName(shiftOf(cid, sec)), from: t12(shiftOf(cid, sec).periods[0][0]), to: t12(shiftOf(cid, sec).periods.at(-1)[1]) }))}` : "");
  ui._tt = null;
  if (role === "admin" && (ui.ttMode || "class") === "class") {
    const cid = getClass(ui.ttClass) ? ui.ttClass : sortedClasses().find((c) => c.level === 9)?.id || sortedClasses()[0]?.id;
    const c = getClass(cid); const sec = c?.sections.includes(ui.ttSec) ? ui.ttSec : c?.sections[0];
    const entries = state.timetable.filter((x) => x.classId === cid && x.section === sec);
    sub = t("Weekly routine for {class}. Click any period to change it.", { class: esc(classLabel(cid, sec)) }) + shiftNote(cid, sec);
    controls = `${modeSeg("class")}${selectFilter("ttClass", t("Class"), classOptions(false), cid)}${selectFilter("ttSec", t("Section"), (c?.sections || []).map((s) => [s, s]), sec)}`;
    ui._tt = { cid, sec };
    body = c ? `<div class="card card-pad">${ttGrid(shiftOf(cid, sec), entries, { edit: true, cls: c, cell: (x) => `<span class="s">${esc(subj(x.subject))}</span><span class="m">${esc(getTeacher(x.teacherId)?.name ?? t("No teacher"))} · ${room(x)}</span>` })}</div>` : "";
  } else if (role === "admin") {
    const tid = getTeacher(ui.ttTeacher) ? ui.ttTeacher : state.teachers[0]?.id;
    const entries = state.timetable.filter((x) => x.teacherId === tid);
    sub = t("{name} teaches {n} periods a week.", { name: esc(getTeacher(tid)?.name), n: entries.length });
    controls = `${modeSeg("teacher")}${selectFilter("ttTeacher", t("Teacher"), state.teachers.map((x) => [x.id, `${x.name} (${subj(x.subject)})`]), tid)}`;
    body = ttByShift(entries, (x) => `<span class="s">${esc(subj(x.subject))}</span><span class="m">${esc(classLabel(x.classId, x.section))} · ${room(x)}</span>`);
  } else if (role === "teacher") {
    const entries = state.timetable.filter((x) => x.teacherId === state.personas.teacher);
    sub = t("Your {n} periods this week.", { n: entries.length });
    body = ttByShift(entries, (x) => `<span class="s">${esc(classLabel(x.classId, x.section))}</span><span class="m">${esc(subj(x.subject))} · ${room(x)}</span>`);
  } else {
    const s = childOf();
    const entries = state.timetable.filter((x) => x.classId === s.classId && x.section === s.section);
    title = t("Class Routine"); sub = t("Weekly routine for {class}.", { class: esc(classLabel(s.classId, s.section)) }) + shiftNote(s.classId, s.section);
    body = `<div class="card card-pad">${ttGrid(shiftOf(s.classId, s.section), entries, { cell: (x) => `<span class="s">${esc(subj(x.subject))}</span><span class="m">${esc(getTeacher(x.teacherId)?.initials ?? "—")} · ${room(x)}</span>` })}</div>`;
  }
  return `<div class="page">
    ${head(title, sub)}
    ${controls ? `<div class="toolbar">${controls}</div>` : ""}
    <div class="stack">${body}</div>
  </div>`;
};

// ---------- Exams ----------
VIEWS.exams = () => {
  const role = state.role, td = today();
  const tab = ui.exTab || "upcoming";
  let list = state.exams;
  let mine = null;
  if (role === "teacher") { mine = teachingOf(state.personas.teacher); list = list.filter((e) => mine.some((x) => x.classId === e.classId && x.subject === e.subject)); }
  if (ui.exClass) list = list.filter((e) => e.classId === ui.exClass);
  if (ui.exTerm) list = list.filter((e) => e.term === ui.exTerm);
  const up = list.filter((e) => e.date >= td), past = list.filter((e) => e.date < td);
  const shown = (tab === "upcoming" ? up.sort((a, b) => a.date.localeCompare(b.date)) : past.sort((a, b) => b.date.localeCompare(a.date)));
  const entered = (e) => {
    const studs = role === "teacher" ? mine.filter((x) => x.classId === e.classId && x.subject === e.subject).flatMap((x) => subjectStudents(x.classId, x.section, e.subject)) : subjectStudents(e.classId, null, e.subject);
    const n = studs.filter((s) => state.marks[e.id]?.[s.id] !== undefined).length;
    return [n, studs.length];
  };
  return `<div class="page">
    ${head(t("Exams"), role === "teacher" ? t("Exams for the classes you teach. Enter marks once an exam is over.") : t("Every exam and class test across the school."), `<button class="btn primary" data-action="create-exam">${plus} ${t("Create exam")}</button>`)}
    <div class="toolbar">
      ${seg("exTab", [["upcoming", `${t("Upcoming")} <span class="count">${up.length}</span>`], ["past", `${t("Past")} <span class="count">${past.length}</span>`]], tab)}
      ${searchBox("examTbl", t("Search subject, class or term"))}
      ${selectFilter("exTerm", t("Term"), [["", t("All terms")], ...termOptions(terms())], ui.exTerm || "")}
      ${selectFilter("exClass", t("Class"), classOptions(), ui.exClass || "")}
    </div>
    <div class="card card-pad">
      ${table([t("Subject"), t("Class"), t("Term"), t("Date"), [t("Full marks"), "num"], tab === "past" ? t("Marks entered") : t("Time"), ["", "r"]], shown.map((e) => {
        const [n, of] = entered(e);
        return `<tr data-s="${esc(`${subj(e.subject)} ${e.subject} ${className(e.classId)} ${term(e.term)} ${e.term}`.toLowerCase())}">
          <td class="strong">${esc(subj(e.subject))}</td><td>${esc(className(e.classId))}</td><td class="t2">${esc(term(e.term))}</td>
          <td class="mono">${fmtDate(e.date)}<span class="sub-l">${relDay(e.date)}</span></td><td class="num mono">${e.fullMarks}${e.parts.length ? `<span class="sub-l">${esc(partsText(e.parts))}</span>` : ""}</td>
          <td>${tab === "past" ? (n === of ? `<span class="pill green">${t("All {n}", { n: of })}</span>` : `<span class="pill ${n ? "amber" : "red"}">${t("{n} of {of}", { n, of })}</span>`) : t12(e.start)}</td>
          <td class="r">${tab === "past" ? `<a class="btn sm" href="#/marks/${e.id}">${n === of ? t("View marks") : t("Enter marks")}</a>` : ""}${role === "admin" ? ` <button class="btn sm ghost" data-action="edit-exam" data-id="${e.id}">${t("Edit")}</button>` : ""}</td></tr>`;
      }), tab === "upcoming" ? t("No upcoming exams.") : t("No past exams."), "examTbl")}
    </div>
  </div>`;
};

// "CQ 70 · MCQ 30"
const partsText = (parts) => parts.map((x) => `${t(PART_SHORT[x.key])} ${x.full}`).join(" · ");
VIEWS.marks = (eid, secParam) => {
  const e = getExam(eid);
  if (!e) return `<div class="page">${head(t("Exam not found"), "", "", ["#/exams", t("Back to exams")])}</div>`;
  const c = getClass(e.classId);
  let secs = (c?.sections || []).filter((sec) => subjectStudents(e.classId, sec, e.subject).length);
  if (state.role === "teacher") secs = teachingOf(state.personas.teacher).filter((x) => x.classId === e.classId && x.subject === e.subject).map((x) => x.section);
  const sec = secs.includes(ui.mkSec) ? ui.mkSec : secs.includes(secParam) ? secParam : secs[0];
  // Only the students who take the subject (their group, religion, 4th subject).
  const studs = sec ? subjectStudents(e.classId, sec, e.subject) : [];
  const m = state.marks[e.id] || {}, mp = state.markParts?.[e.id] || {};
  const vals = studs.map((s) => m[s.id]).filter((v) => v !== undefined);
  const future = e.date > today();
  const parts = e.parts;
  const gradeHtml = (v, got) => { if (v === undefined || v === null) return ""; const failed = failedParts(parts, got); return gradeTag(gradeFor(failed.length ? 0 : (v / e.fullMarks) * 100).grade) + (failed.length ? `<span class="sub-l fail-note">${esc(failed.map((k) => t(PART_SHORT[k])).join(", "))}</span>` : ""); };
  const inputs = (s) => parts.length
    ? `<div class="parts-in">${parts.map((x) => `<input class="input marks-input mono" type="number" min="0" max="${x.full}" step="0.5" name="${s.id}|${x.key}" data-sid="${s.id}" data-max="${x.full}" value="${mp[s.id]?.[x.key] ?? ""}" placeholder="${esc(t(PART_SHORT[x.key]))}" aria-label="${esc(t(PART_LABELS[x.key]))}" />`).join("")}<b class="mono part-total" data-total-for="${s.id}">${m[s.id] ?? "—"}</b></div>`
    : `<input class="input marks-input mono" type="number" min="0" max="${e.fullMarks}" step="0.5" name="${s.id}" data-sid="${s.id}" data-max="${e.fullMarks}" value="${m[s.id] ?? ""}" placeholder="—" />`;
  return `<div class="page narrow">
    ${head(`${subj(e.subject)} — ${className(e.classId)}`, t("{term} · {day} at {time} · out of {full}", { term: esc(term(e.term)), day: fmtDay(e.date), time: t12(e.start), full: e.fullMarks }), "", ["#/exams", t("Back to exams")])}
    ${future ? emptyBox(t("This exam hasn't happened yet"), t("Marks can be entered from {date}.", { date: fmtDate(e.date) })) : `
    <div class="stats" style="--n:3">
      <div class="stat"><div class="n">${vals.length}<small>/ ${studs.length}</small></div><div class="l">${t("Marks entered")}</div></div>
      <div class="stat"><div class="n">${vals.length ? (sum(vals) / vals.length).toFixed(1) : "–"}</div><div class="l">${t("Average")}</div></div>
      <div class="stat"><div class="n">${vals.length ? Math.max(...vals) : "–"}</div><div class="l">${t("Highest")}</div></div>
    </div>
    <div class="card card-pad">
      <div class="card-head"><span class="card-title">${esc(classLabel(e.classId, sec))}</span>${secs.length > 1 ? seg("mkSec", secs.map((s) => [s, t("Section {s}", { s })]), sec, "sm") : ""}</div>
      ${parts.length ? `<p class="card-sub">${esc(t("Marks for each part. A student must get at least the pass mark in every part: {list}.", { list: parts.map((x) => t("{part} {pass} of {full}", { part: t(PART_LABELS[x.key]), pass: passMark(x.full), full: x.full })).join(", ") }))}</p>` : ""}
      ${studs.length < sectionStudents(e.classId, sec).length ? `<p class="card-sub">${esc(t("Only the {n} students who take {subject} are listed.", { n: studs.length, subject: subj(e.subject) }))}</p>` : ""}
      <form id="marksForm" data-exam="${e.id}" data-section="${esc(sec ?? "")}">
        <div class="roster">${parts.length && studs.length ? `<div class="roster-row roster-head"><span></span><span></span><div style="display:flex;align-items:center;gap:10px"><div class="parts-in">${parts.map((x) => `<span>${esc(t(PART_SHORT[x.key]))} /${x.full}</span>`).join("")}<span class="part-total">${t("Total")}</span></div><span style="min-width:40px"></span></div></div>` : ""}${studs.map((s) => `<div class="roster-row"><span class="roll">${t("Roll {roll}", { roll: s.roll })}</span><div class="who">${avatar(s.name, s.id)}<div><div class="nm">${esc(s.name)}</div></div></div>
            <div style="display:flex;align-items:center;gap:10px">${inputs(s)}<span data-grade-for="${s.id}" style="min-width:40px">${gradeHtml(m[s.id], mp[s.id])}</span></div></div>`).join("") || `<div class="muted">${t("No students in this section take this subject.")}</div>`}</div>
        <div class="form-actions" style="margin-top:18px"><button class="btn primary">${t("Save marks")}</button><span class="hint" style="margin:0">${parts.length ? t("Leave every part empty if the student was absent.") : t("Leave a box empty if the student was absent.")}</span></div>
      </form>
    </div>`}
  </div>`;
};
MOUNTS.marks = (root) => {
  const form = $("#marksForm", root); if (!form) return;
  const e = getExam(form.dataset.exam), parts = e.parts;
  const bad = (i) => i.value !== "" && (Number(i.value) < 0 || Number(i.value) > Number(i.dataset.max));
  // A student's marks: a number, or { cq, mcq, … } for an exam in parts
  // (null when everything is empty).
  const read = (sid) => {
    if (!parts.length) { const i = $(`[name="${sid}"]`, form); return i.value === "" ? null : Number(i.value); }
    const got = Object.fromEntries(parts.map((x) => { const v = $(`[name="${sid}|${x.key}"]`, form).value; return [x.key, v === "" ? null : Number(v)]; }));
    return Object.values(got).every((v) => v === null) ? null : got;
  };
  form.addEventListener("input", (ev) => {
    const i = ev.target, sid = i.dataset.sid; if (!sid) return;
    i.classList.toggle("bad", bad(i));
    const v = read(sid), box = $(`[data-grade-for="${sid}"]`);
    if (!parts.length) { box.innerHTML = v === null || bad(i) ? "" : gradeTag(gradeFor((v / e.fullMarks) * 100).grade); return; }
    const filled = v && parts.every((x) => v[x.key] !== null);
    const total = v ? sum(parts.map((x) => v[x.key] ?? 0)) : null;
    $(`[data-total-for="${sid}"]`).textContent = total ?? "—";
    const failed = filled ? failedParts(parts, v) : [];
    box.innerHTML = !filled || $$(`[data-sid="${sid}"]`, form).some(bad) ? "" : gradeTag(gradeFor(failed.length ? 0 : (total / e.fullMarks) * 100).grade) + (failed.length ? `<span class="sub-l fail-note">${esc(failed.map((k) => t(PART_SHORT[k])).join(", "))}</span>` : "");
  });
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const wrong = $$("input", form).filter(bad);
    if (wrong.length) { toast(t("Marks must be between 0 and {full}.", { full: wrong[0].dataset.max })); wrong[0].focus(); return; }
    const sids = [...new Set($$("[data-sid]", form).map((i) => i.dataset.sid))];
    const marks = Object.fromEntries(sids.map((sid) => [sid, read(sid)]));
    const partial = parts.length && sids.find((sid) => marks[sid] && parts.some((x) => marks[sid][x.key] === null));
    if (partial) { toast(t("Enter every part for {name}, or leave them all empty.", { name: getStudent(partial).name })); $(`[data-sid="${partial}"]`, form).focus(); return; }
    whileBusy(form, () => act("marks.save", { examId: e.id, section: form.dataset.section, marks }, () => toast(t("Marks saved"))));
  });
};

// ---------- Results ----------
function resultTable(r) {
  const notes = [];
  if (r.rows.some((x) => x.optional)) notes.push(t("4th subject: only the points above 2.00 count toward GPA, and failing it doesn't fail the result."));
  if (r.rows.some((x) => x.failedParts.length)) notes.push(t("F because a part is under its pass mark (33%), even if the total is enough."));
  return table([t("Subject"), [t("Full marks"), "num"], [t("Obtained"), "num"], [t("Grade"), "num"], ...(hasPoints() ? [[t("Point"), "num"]] : []), [t("Highest in class"), "r"]], r.rows.map((x) => {
    const all = Object.values(state.marks[x.exam.id] || {});
    const partLine = x.parts ? `<span class="sub-l">${x.exam.parts.map((pp) => `<span class="${x.failedParts.includes(pp.key) ? "fail-note" : ""}">${esc(t(PART_SHORT[pp.key]))} ${x.parts[pp.key] ?? "—"}/${pp.full}</span>`).join(" · ")}</span>` : "";
    return `<tr><td class="strong">${esc(subj(x.subject))}${x.optional ? ` <span class="pill plain sm-pill">${t("4th subject")}</span>` : ""}</td><td class="num mono">${x.full}</td><td class="num mono">${x.got ?? "—"}${partLine}</td><td class="num">${x.grade ? gradeTag(x.grade) : `<span class="muted">${t("Pending")}</span>`}</td>${hasPoints() ? `<td class="num mono">${x.point !== undefined && x.point !== "" && x.grade ? Number(x.point).toFixed(2) : "—"}</td>` : ""}<td class="r mono">${all.length ? Math.max(...all) : "—"}</td></tr>`;
  })) + notes.map((n) => `<div class="hint">${esc(n)}</div>`).join("");
}
function resultSummary(sid, termName) {
  const r = studentResult(sid, termName), pos = positionOf(sid, termName);
  const s = getStudent(sid);
  return `<div class="stats" style="--n:4">
    <div class="stat"><div class="n">${gpaText(r)}</div><div class="l">${hasPoints() ? t("GPA") : t("Overall")}</div></div>
    <div class="stat"><div class="n">${r.grade ? esc(t.grade(r.grade)) : "–"}</div><div class="l">${t("Overall grade")}</div></div>
    <div class="stat"><div class="n">${r.total}<small>/ ${r.fullTotal}</small></div><div class="l">${t("Total marks")}</div></div>
    <div class="stat"><div class="n">${pos ? t.ordinal(pos) : "–"}<small>${t("of {n}", { n: sectionRanking(s.classId, s.section, termName).length })}</small></div><div class="l">${t("Position in section")}</div></div>
  </div>
  <div class="card card-pad">
    <div class="card-head"><span class="card-title">${esc(term(termName))}</span>${r.complete ? "" : `<span class="pill amber">${t("{n} subjects pending", { n: r.count - r.done })}</span>`}</div>
    ${resultTable(r)}
  </div>`;
}
const visibleTerms = (cid) => terms().filter((tm) => state.published[tm] && termHasMarks(tm, cid));

VIEWS.results = () => {
  if (state.role === "student") {
    const s = childOf(), list = visibleTerms(s.classId);
    if (!list.length) return `<div class="page">${head(t("Results"))}${emptyBox(t("No results published yet"), t("Results show up here as soon as the school publishes them."))}</div>`;
    const tm = list.includes(ui.rsTerm) ? ui.rsTerm : list.at(-1);
    return `<div class="page">${head(t("Results"), `${esc(classLabel(s.classId, s.section))} · ${t("Roll {roll}", { roll: s.roll })}`)}
      ${list.length > 1 ? `<div class="toolbar">${seg("rsTerm", list.map((x) => [x, esc(term(x))]), tm)}</div>` : ""}
      ${resultSummary(s.id, tm)}</div>`;
  }
  const all = terms().filter((tm) => termHasMarks(tm));
  const tm = all.includes(ui.rsTerm) ? ui.rsTerm : all.filter((x) => state.published[x]).at(-1) || all.at(-1);
  const cid = getClass(ui.rsClass) ? ui.rsClass : sortedClasses().find((c) => c.level === 9)?.id || sortedClasses()[0].id;
  const c = getClass(cid); const sec = c.sections.includes(ui.rsSec) ? ui.rsSec : c.sections[0];
  if (!tm) return `<div class="page">${head(t("Results"))}${emptyBox(t("No marks yet"), t("Results appear once teachers enter marks for an exam."))}</div>`;
  const studs = sectionStudents(cid, sec);
  // The section's subjects: those at least one of its students takes.
  const exams = state.exams.filter((e) => e.term === tm && e.classId === cid && studs.some((s) => takesExam(s, e))).sort((a, b) => a.date.localeCompare(b.date));
  const ranking = sectionRanking(cid, sec, tm);
  const rs = studs.map((s) => ({ s, r: studentResult(s.id, tm) }));
  const passed = rs.filter((x) => x.r.done && gradeTone(x.r.grade) !== "g-fail").length;
  const withGpa = rs.filter((x) => x.r.gpa !== null);
  const abbr = (s) => s.length <= 8 ? s : s.split(" ").map((w) => w.slice(0, 4)).join(" ");
  return `<div class="page">
    ${head(t("Results"), t("Marks, grades and positions by section. Publish a term to show it to students and parents."), `<a class="btn lg" href="#/print/cards/${cid}/${encodeURIComponent(sec)}/${encodeURIComponent(tm)}">${t("Print result cards")}</a><a class="btn lg" href="#/print/tabulation/${cid}/${encodeURIComponent(sec)}/${encodeURIComponent(tm)}">${t("Print tabulation sheet")}</a>`)}
    <div class="toolbar">
      ${selectFilter("rsTerm", t("Term"), termOptions(all), tm)}
      ${selectFilter("rsClass", t("Class"), classOptions(false), cid)}
      ${selectFilter("rsSec", t("Section"), c.sections.map((s) => [s, s]), sec)}
    </div>
    <div class="card panel" style="padding:18px 24px">
      <div class="check-row" style="border:0;padding:0"><div><div class="t">${t("Published to students and parents")}</div><div class="d">${esc(term(tm))} — ${state.published[tm] ? t("students and parents can see these results.") : t("only staff can see these results right now.")}</div></div>
      <input type="checkbox" class="checkbox" data-action="publish-term" data-term="${esc(tm)}" ${state.published[tm] ? "checked" : ""} /></div>
    </div>
    <div class="stats" style="--n:4">
      <div class="stat"><div class="n">${pct(passed, rs.filter((x) => x.r.done).length)}<small>%</small></div><div class="l">${t("Pass rate")}</div></div>
      <div class="stat"><div class="n">${withGpa.length ? (sum(withGpa.map((x) => x.r.gpa)) / withGpa.length).toFixed(2) : "–"}</div><div class="l">${hasPoints() ? t("Average GPA") : t("Average score")}</div></div>
      <div class="stat"><div class="n">${rs.filter((x) => x.r.grade === state.grading.ranges[0]?.grade).length}</div><div class="l">${t("Top grade ({grade})", { grade: esc(t.grade(state.grading.ranges[0]?.grade ?? "")) })}</div></div>
      <div class="stat"><div class="n" style="font-size:22px;line-height:34px">${ranking[0] ? esc(ranking[0].s.name) : "–"}</div><div class="l">${t("First in section")}</div></div>
    </div>
    <div class="card card-pad">
      ${table([t("Pos."), t("Student"), ...exams.map((e) => [esc(abbr(subj(e.subject))), "num"]), [t("Total"), "num"], [t("GPA"), "num"], [t("Grade"), "r"]], rs.sort((a, b) => (ranking.findIndex((x) => x.s.id === a.s.id) + 1 || 999) - (ranking.findIndex((x) => x.s.id === b.s.id) + 1 || 999)).map(({ s, r }) => {
        const pos = ranking.findIndex((x) => x.s.id === s.id) + 1;
        return `<tr class="click" data-href="#/students/${s.id}"><td class="mono">${pos || "—"}</td><td><div class="who">${avatar(s.name, s.id)}<div><div class="nm">${esc(s.name)}</div><div class="em">${t("Roll {roll}", { roll: s.roll })}</div></div></div></td>
          ${exams.map((e) => { const x = r.rows.find((y) => y.exam.id === e.id); return x ? `<td class="num mono" style="${x.grade && gradeTone(x.grade) === "g-fail" ? "color:var(--danger-text);font-weight:600" : ""}" ${x.failedParts.length ? `title="${esc(t("Failed {parts}", { parts: x.failedParts.map((k) => t(PART_SHORT[k])).join(", ") }))}"` : ""}>${x.got ?? "—"}</td>` : `<td class="num muted" title="${esc(t("Doesn't take this subject"))}">·</td>`; }).join("")}
          <td class="num mono strong">${r.done ? r.total : "—"}</td><td class="num mono">${gpaText(r)}</td><td class="r">${r.grade ? gradeTag(r.grade) : "—"}</td></tr>`;
      }), t("No students in this section."))}
    </div>
  </div>`;
};

VIEWS.reports = () => {
  const s = childOf(), list = visibleTerms(s.classId);
  const tm = list.includes(ui.rsTerm) ? ui.rsTerm : list.at(-1);
  const rate = studentRate(s.id);
  const hw = myHomework(s).filter((h) => h.due < today());
  const hwDone = hw.filter((h) => h.submissions[s.id]).length;
  return `<div class="page">
    ${head(t("Reports"), t("Report card for {name}.", { name: esc(s.name) }), tm ? `<a class="btn lg no-print" href="#/print/card/${encodeURIComponent(tm)}">${t("Print result card")}</a>` : "")}
    <div class="card profile">${avatar(s.name, s.id, "xl")}<div class="info"><h2>${esc(s.name)}</h2>
      <div class="meta"><span class="pill plain">${esc(classLabel(s.classId, s.section))}</span><span class="pill plain">${t("Roll {roll}", { roll: s.roll })}</span><span class="pill plain">${esc(state.settings.school)}</span></div></div>
      ${list.length > 1 ? `<div class="no-print">${seg("rsTerm", list.map((x) => [x, esc(term(x))]), tm, "sm")}</div>` : ""}</div>
    <div class="${feature("homework") ? "grid-2 stretch" : "stack"}" style="margin-bottom:14px">
      <div class="card card-pad"><div class="card-head"><span class="card-title">${t("Attendance")}</span>${seeAll("#/attendance", t("Details"))}</div>
        <div class="meter-head"><span>${t("Last 30 school days")}</span><b>${rate ?? "–"}%</b></div>${meter(rate ?? 0, (rate ?? 0) < state.settings.threshold ? "red" : "green")}
        <div class="hint" style="margin-top:10px">${t("School threshold is {th}%.", { th: state.settings.threshold })}</div></div>
      ${feature("homework") ? `<div class="card card-pad"><div class="card-head"><span class="card-title">${t("Homework")}</span>${seeAll("#/homework", t("Details"))}</div>
        <div class="meter-head"><span>${t("Submitted")}</span><b>${pct(hwDone, hw.length)}%</b></div>${meter(pct(hwDone, hw.length))}
        <div class="hint" style="margin-top:10px">${t("{n} of {of} past homeworks submitted.", { n: hwDone, of: hw.length })}</div></div>` : ""}
    </div>
    ${tm ? resultSummary(s.id, tm) : emptyBox(t("No results published yet"), t("The report card fills in once the school publishes exam results."))}
  </div>`;
};

// ---------- Students ----------
VIEWS.students = (id) => {
  if (id) return studentProfile(getStudent(id));
  const role = state.role;
  let list = state.students;
  let classOpts = classOptions();
  if (role === "teacher") {
    const secs = mySections(state.personas.teacher);
    list = list.filter((s) => secs.some(([c, sec]) => c === s.classId && sec === s.section));
    classOpts = [["", t("All my sections")], ...secs.map(([c, sec]) => [`${c}|${sec}`, classLabel(c, sec)])];
    if (ui.stClass) { const [c, sec] = ui.stClass.split("|"); list = list.filter((s) => s.classId === c && (!sec || s.section === sec)); }
  } else if (ui.stClass) list = list.filter((s) => s.classId === ui.stClass);
  const ym = thisMonth();
  list = [...list].sort((a, b) => (getClass(a.classId)?.level ?? 0) - (getClass(b.classId)?.level ?? 0) || a.section.localeCompare(b.section) || a.roll - b.roll);
  return `<div class="page">
    ${head(t("Students"), role === "teacher" ? t("{n} students in your sections.", { n: list.length }) : t("{n} students.", { n: list.length }), role === "admin" ? `<button class="btn primary" data-action="add-student">${plus} ${t("Add student")}</button>` : "")}
    <div class="toolbar">${searchBox("stuTbl", t("Search by name, roll or guardian"))}${selectFilter("stClass", role === "teacher" ? t("Section") : t("Class"), classOpts, ui.stClass || "")}</div>
    <div class="card card-pad">
      ${table([t("Student"), t("Class"), [t("Roll"), "num"], t("Attendance"), ...(role === "admin" ? [t("Fees due")] : []), t("Guardian's phone")], list.map((s) => `<tr class="click" data-href="#/students/${s.id}" data-s="${esc(`${s.name} ${s.guardian} ${s.roll} ${className(s.classId)}`.toLowerCase())}">
        <td><div class="who">${avatar(s.name, s.id)}<div><div class="nm">${esc(s.name)}</div><div class="em">${t("Guardian: {name}", { name: esc(s.guardian) })}</div></div></div></td>
        <td>${esc(classLabel(s.classId, s.section))}</td><td class="num mono">${s.roll}</td><td>${inlineMeter(studentRate(s.id))}</td>${role === "admin" ? `<td>${dueTag(studentDue(s.id))}</td>` : ""}<td class="mono t2">${s.phone ? latin(esc(s.phone)) : `<span class="muted" title="${esc(t("Only the class teacher sees this"))}">—</span>`}</td></tr>`), t("No students match."), "stuTbl")}
    </div>
  </div>`;
};
function studentProfile(s) {
  if (!s) return `<div class="page">${head(t("Student not found"), "", "", ["#/students", t("Back to students")])}</div>`;
  const rate = studentRate(s.id);
  const rec = attendanceOf(s.id).slice(-20);
  const lastTerm = [...terms()].reverse().find((tm) => termHasMarks(tm, s.classId));
  const r = lastTerm ? studentResult(s.id, lastTerm) : null;
  return `<div class="page">
    <a class="back" href="#/students">${arrowLeft}${t("Back to students")}</a>
    <div class="card profile">${avatar(s.name, s.id, "xl")}<div class="info"><h2>${esc(s.name)}</h2>
      <div class="meta"><span class="pill plain">${esc(classLabel(s.classId, s.section))}</span><span class="pill plain">${t("Roll {roll}", { roll: s.roll })}</span><span class="pill plain">${t("ID {id}", { id: latin(esc(s.id.toUpperCase())) })}</span></div></div>
      ${state.role === "admin" ? `<div class="actions" style="display:flex;gap:8px"><button class="btn lg" data-action="edit-student" data-id="${s.id}">${t("Edit")}</button></div>` : ""}</div>
    <div class="grid-2">
      <div class="card card-pad"><div class="card-head"><span class="card-title">${t("Attendance")}</span><span class="pill-static">${t("Last 30 school days")}</span></div>
        <div class="meter-head"><span>${t("{a} absences in the last {n} days", { a: rec.filter(([, v]) => v === "A").length, n: rec.length })}</span><b>${rate ?? "–"}%</b></div>${meter(rate ?? 0, (rate ?? 0) < state.settings.threshold ? "red" : "green")}
        <div class="cal" style="grid-template-columns:repeat(10,minmax(0,1fr));margin-top:18px">${rec.map(([d, v]) => `<div class="cal-d ${v}" title="${esc(`${fmtDay(d)}: ${t(MARK_LABEL[v])}`)}" style="height:32px;font-size:11px">${dateObj(d).getDate()}</div>`).join("")}</div>
        <div class="legend"><span><i style="background:var(--green-soft)"></i>${t("Present")}</span><span><i style="background:var(--amber-soft)"></i>${t("Late")}</span><span><i style="background:var(--danger)"></i>${t("Absent")}</span></div></div>
      <div class="card card-pad"><div class="card-head"><span class="card-title">${t("Details")}</span></div>
        <dl class="kv"><dt>${t("Guardian")}</dt><dd>${esc(s.guardian)}</dd><dt>${t("Guardian's phone")}</dt><dd>${s.phone ? latin(esc(s.phone)) : `<span class="muted">${t("Only the class teacher sees this")}</span>`}</dd><dt>${t("Class teacher")}</dt><dd>${esc(getTeacher(classTeacherId(s.classId, s.section))?.name ?? t("Not assigned"))}</dd>${groupOf(s.classId, s.section) ? `<dt>${t("Group")}</dt><dd>${esc(groupLabel(groupOf(s.classId, s.section)))}</dd>` : ""}${s.religion ? `<dt>${t("Religion")}</dt><dd>${esc(religionLabel(s.religion))}</dd>` : ""}${s.optional ? `<dt>${t("4th subject")}</dt><dd>${esc(subj(s.optional))}</dd>` : ""}<dt>${t("Gender")}</dt><dd>${esc(L(s.gender))}</dd><dt>${t("Date of birth")}</dt><dd>${fmtDate(s.dob)}</dd><dt>${t("Admitted")}</dt><dd>${fmtDate(s.admitted)}</dd>${state.role === "admin" ? `<dt>${t("Monthly fee")}</dt><dd>${money(feeAmount(s))}${s.discount ? ` · ${esc(discountText(s.discount))}` : ""}</dd>` : ""}</dl></div>
    </div>
    <div class="${state.role === "admin" ? "grid-2" : "stack"}">
      <div class="card card-pad"><div class="card-head"><span class="card-title">${esc(lastTerm ? term(lastTerm) : t("Results"))}</span>${r ? `<span class="pill-static">${hasPoints() ? `${t("GPA")} ${gpaText(r)}` : `${t("Grade")} ${esc(t.grade(r.grade ?? "–"))}`}</span>` : ""}</div>
        ${r ? `<div class="hbars">${r.rows.map((x) => `<div class="hbar"><span class="nm">${esc(subj(x.subject))}</span>${meter(x.pct ?? 0, x.grade && gradeTone(x.grade) === "g-fail" ? "red" : "")}<span class="v">${x.got ?? "—"}</span></div>`).join("")}</div>` : `<div class="muted">${t("No marks yet.")}</div>`}</div>
      ${state.role === "admin" ? studentFeesCard(s) : ""}
    </div>
    ${state.role === "admin" ? `<div class="card card-pad"><div class="card-head"><span class="card-title">${t("Sign-in accounts")}</span></div>
      <div class="list">${accountItem(`s:${s.id}`, t("Student · shared with guardian {name}", { name: esc(s.guardian) }))}</div></div>` : ""}
  </div>`;
}

// A student's fees on their profile (admin): dues, with discount and remove
// buttons, and the latest receipts.
function studentFeesCard(s) {
  const list = chargesOf(s.id).slice().sort((a, b) => b.dueOn.localeCompare(a.dueOn)).slice(0, 8);
  return `<div class="card card-pad"><div class="card-head"><span class="card-title">${t("Fees")}</span><div class="tools">${dueTag(studentDue(s.id))}</div></div>
    <div class="list">${list.map((c) => `<div class="item"><span class="item-text"><span class="t">${esc(chargeLabel(c))}</span><span class="m">${money(net(c))}${c.discount ? ` (${t("{amount} off", { amount: money(c.discount) })})` : ""} · ${c.paid ? t("{amount} paid", { amount: money(c.paid) }) : t("Due {date}", { date: fmtDate(c.dueOn) })}</span></span>${feePill(chargeStatus(c))}
      ${dueOf(c) ? `<button type="button" class="btn sm ghost" data-action="discount-charge" data-id="${c.id}">${t("Discount")}</button>` : ""}${!c.paid && c.kind !== "tuition" ? `<button type="button" class="btn sm ghost" data-action="delete-charge" data-id="${c.id}">${t("Remove")}</button>` : ""}</div>`).join("") || `<div class="muted">${t("No fees yet.")}</div>`}</div>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><button class="btn sm primary" data-action="collect-fee" data-sid="${s.id}" ${studentDue(s.id) ? "" : "disabled"}>${t("Collect payment")}</button><button class="btn sm" data-action="charge-fee" data-sid="${s.id}">${t("Add a fee")}</button>
      ${paymentsOf(s.id).slice(0, 3).map((x) => `<a class="btn sm ghost" href="#/receipt/${x.id}">${t("Receipt {no}", { no: x.receiptNo })}</a>`).join("")}</div></div>`;
}

// ---------- Teachers ----------
VIEWS.teachers = () => {
  const subjects = [...new Set(state.teachers.map((x) => x.subject))].sort();
  let list = state.teachers.filter((x) => !ui.tcSubject || x.subject === ui.tcSubject);
  return `<div class="page">
    ${head(t("Teachers"), t("{n} teachers across {m} subjects.", { n: state.teachers.length, m: subjects.length }), `<button class="btn primary" data-action="add-teacher">${plus} ${t("Add teacher")}</button>`)}
    <div class="toolbar">${searchBox("tchTbl", t("Search teachers"))}${selectFilter("tcSubject", t("Subject"), [["", t("All subjects")], ...subjects.map((s) => [s, subj(s)])], ui.tcSubject || "")}</div>
    <div class="card card-pad">
      ${table([t("Teacher"), [t("Initial"), "num"], t("Subject"), t("Class teacher of"), t("Sections"), [t("Periods / week"), "num"], t("Phone")], list.map((x) => {
        const secs = teacherSections(x.id), ct = classTeacherOf(x.id);
        return `<tr class="click" data-action="edit-teacher" data-id="${x.id}" data-s="${esc(`${x.name} ${x.subject} ${subj(x.subject)} ${x.initials}`.toLowerCase())}">
          <td><div class="who">${avatar(x.name, `t:${x.id}`)}<div><div class="nm">${esc(x.name)}</div><div class="em">${latin(esc(x.email))}</div></div></div></td>
          <td class="num mono strong">${esc(x.initials)}</td><td>${esc(subj(x.subject))}</td>
          <td>${ct.length ? ct.map(([c, s]) => `<span class="pill plain" style="margin:0 4px 4px 0">${esc(`${classShort(c)} ${s}`)}</span>`).join("") : `<span class="muted">—</span>`}</td>
          <td class="t2">${secs.length ? esc(secs.slice(0, 4).map(([c, s]) => `${classShort(c)} ${s}`).join(", ")) + (secs.length > 4 ? ` +${secs.length - 4}` : "") : "—"}</td>
          <td class="num mono">${state.timetable.filter((p) => p.teacherId === x.id).length}</td><td class="mono t2">${latin(esc(x.phone))}</td></tr>`;
      }), t("No teachers match."), "tchTbl")}
    </div>
  </div>`;
};

// ---------- Fees ----------
// Admin: who owes what (and collecting it), and every receipt.
VIEWS.fees = () => {
  if (state.role !== "admin") return feesFamily();
  const tab = ui.feTab || "dues";
  const ym = thisMonth();
  const tu = state.charges.filter((c) => c.kind === "tuition" && c.period === ym);
  const monthIn = sum(state.payments.filter((x) => x.paidOn.startsWith(ym)).map((x) => x.amount));
  const outstanding = sum(state.charges.map(dueOf));
  const owingAll = state.students.filter((s) => studentDue(s.id) > 0);
  const reminded = state.reminders[ym];
  const top = `${head(t("Fees & Payments"), t("Tuition is charged every month and due on the 10th. Add admission, session or exam fees as needed."), `<button class="btn lg" data-action="charge-fee">${plus} ${t("Add a fee")}</button><button class="btn lg" data-action="send-reminders" ${owingAll.length ? "" : "disabled"}>${reminded ? t("SMS sent {date} · send again", { date: fmtDate(reminded) }) : t("SMS reminders")}</button>`)}
    <div class="stats" style="--n:4">
      <div class="stat"><div class="n">${money(monthIn)}</div><div class="l">${t("Received in {month}", { month: fmtMonth(ym) })}</div></div>
      <div class="stat"><div class="n">${money(outstanding)}</div><div class="l">${t("Due in all")}</div></div>
      <div class="stat"><div class="n">${pct(sum(tu.map((c) => Math.min(c.paid, net(c)))), sum(tu.map(net)))}<small>%</small></div><div class="l">${t("{month} tuition collected", { month: fmtMonth(ym) })}</div></div>
      <div class="stat"><div class="n">${owingAll.length}</div><div class="l">${t("Students with dues")}</div></div>
    </div>
    <div class="toolbar">${seg("feTab", [["dues", t("Dues")], ["receipts", t("Receipts")]], tab)}`;
  if (tab === "receipts") {
    const months = [...new Set(state.payments.map((x) => x.paidOn.slice(0, 7)))].sort().reverse();
    const m = months.includes(ui.feMonth) ? ui.feMonth : months[0];
    const list = state.payments.filter((x) => x.paidOn.startsWith(m ?? ""));
    return `<div class="page">${top}${searchBox("rcptTbl", t("Search receipts"))}${months.length ? selectFilter("feMonth", t("Month"), months.map((x) => [x, fmtMonth(x)]), m) : ""}</div>
      <div class="card card-pad">${table([[t("Receipt"), "num"], t("Date"), t("Student"), t("For"), [t("Amount"), "num"], t("Method"), ["", "r"]], list.map((x) => { const st = getStudent(x.studentId); return `<tr data-s="${esc(`${x.receiptNo} ${st?.name ?? ""}`.toLowerCase())}">
        <td class="num mono strong">${x.receiptNo}</td><td class="mono">${fmtDate(x.paidOn)}</td><td>${esc(st?.name ?? t("Former student"))}<span class="sub-l">${st ? esc(classLabel(st.classId, st.section)) : ""}</span></td>
        <td class="t2">${esc(x.items.map((i) => getCharge(i.chargeId)).filter(Boolean).map(chargeLabel).join(", "))}</td><td class="num mono">${money(x.amount)}</td><td class="t2">${esc(L(x.method))}</td>
        <td class="r"><a class="btn sm" href="#/receipt/${x.id}">${t("Receipt")}</a> <button class="btn sm ghost" data-action="void-receipt" data-id="${x.id}">${t("Cancel")}</button></td></tr>`; }), t("No payments yet."), "rcptTbl")}</div></div>`;
  }
  const show = ui.feShow || "owing";
  let list = state.students.filter((s) => !ui.feClass || s.classId === ui.feClass);
  if (show === "owing") list = list.filter((s) => studentDue(s.id) > 0);
  list = [...list].sort((a, b) => (getClass(a.classId)?.level ?? 0) - (getClass(b.classId)?.level ?? 0) || a.section.localeCompare(b.section) || a.roll - b.roll);
  return `<div class="page">${top}${seg("feShow", [["owing", t("With dues")], ["all", t("All students")]], show, "sm")}${searchBox("feeTbl", t("Search students"))}${selectFilter("feClass", t("Class"), classOptions(), ui.feClass || "")}</div>
    <div class="card card-pad">${table([t("Student"), t("Class"), t("Due for"), [t("Amount due"), "num"], ["", "r"]], list.map((s) => {
      const open = openChargesOf(s.id), owe = studentDue(s.id);
      return `<tr data-s="${esc(`${s.name} ${s.guardian} ${s.roll} ${className(s.classId)}`.toLowerCase())}">
        <td><div class="who">${avatar(s.name, s.id)}<div><div class="nm">${esc(s.name)}</div><div class="em">${esc(s.guardian)}${s.discount ? ` · ${esc(discountText(s.discount))}` : ""}</div></div></div></td>
        <td>${esc(classLabel(s.classId, s.section))}<span class="sub-l">${t("Roll {roll}", { roll: s.roll })}</span></td>
        <td class="t2">${open.length ? esc(open.slice(0, 3).map(chargeLabel).join(", ")) + (open.length > 3 ? ` +${open.length - 3}` : "") : "—"}</td>
        <td class="num mono strong">${owe ? money(owe) : "—"}</td>
        <td class="r">${owe ? `<button class="btn sm primary" data-action="collect-fee" data-sid="${s.id}">${t("Collect")}</button>` : ""} <a class="btn sm ghost" href="#/students/${s.id}">${t("Details")}</a></td></tr>`;
    }), show === "owing" ? t("Nobody owes anything.") : t("No students match."), "feeTbl")}</div></div>`;
};
// A family's fees: what's due, with a demo online payment, and their receipts.
function feesFamily() {
  const s = childOf();
  const list = chargesOf(s.id).slice().sort((a, b) => b.dueOn.localeCompare(a.dueOn));
  const owe = studentDue(s.id), pays = paymentsOf(s.id);
  return `<div class="page">
    ${head(t("Fees & Payments"), `${t("Fees for {name}. Monthly tuition is {amount}, due on the 10th.", { name: esc(s.name), amount: money(feeAmount(s)) })}${s.discount ? ` ${esc(discountText(s.discount))}.` : ""}`, owe ? `<button class="btn lg accent" data-action="pay-fee">${t("Pay {amount}", { amount: money(owe) })}</button>` : "")}
    <div class="stats" style="--n:3">
      <div class="stat"><div class="n">${money(owe)}</div><div class="l">${t("Due now")}</div></div>
      <div class="stat"><div class="n">${money(sum(pays.map((x) => x.amount)))}</div><div class="l">${t("Paid in {year}", { year: esc(state.settings.year) })}</div></div>
      <div class="stat"><div class="n">${pays.length}</div><div class="l">${t("Receipts")}</div></div>
    </div>
    <div class="card card-pad"><div class="card-head"><span class="card-title">${t("Fees")}</span></div>
      ${table([t("Fee"), [t("Amount"), "num"], [t("Paid"), "num"], [t("Amount due"), "num"], t("Due Date"), [t("Status"), "r"]], list.map((c) => `<tr>
        <td class="strong">${esc(chargeLabel(c))}${c.discount ? `<span class="sub-l">${t("{amount} off", { amount: money(c.discount) })}</span>` : ""}</td><td class="num mono">${money(net(c))}</td><td class="num mono">${c.paid ? money(c.paid) : "—"}</td><td class="num mono">${dueOf(c) ? money(dueOf(c)) : "—"}</td><td class="mono">${fmtDate(c.dueOn)}</td>
        <td class="r">${feePill(chargeStatus(c))}</td></tr>`))}</div>
    <div class="card card-pad"><div class="card-head"><span class="card-title">${t("Receipts")}</span></div>
      ${table([[t("Receipt"), "num"], t("Date"), t("For"), [t("Amount"), "num"], t("Method"), ["", "r"]], pays.map((x) => `<tr><td class="num mono strong">${x.receiptNo}</td><td class="mono">${fmtDate(x.paidOn)}</td><td class="t2">${esc(x.items.map((i) => getCharge(i.chargeId)).filter(Boolean).map(chargeLabel).join(", "))}</td><td class="num mono">${money(x.amount)}</td><td class="t2">${esc(L(x.method))}</td><td class="r"><a class="btn sm" href="#/receipt/${x.id}">${t("Receipt")}</a></td></tr>`), t("No payments yet."))}</div>
  </div>`;
}

// ---------- Printed sheets: money receipt, result cards, tabulation sheet ----------
const printBar = (back) => `<div class="toolbar no-print"><a class="btn lg" href="${back[0]}">${arrowLeft} ${esc(back[1])}</a><button class="btn lg primary" data-action="print">${t("Print")}</button></div>`;
const signLine = (labels) => `<div class="sheet-signs">${labels.map((l) => `<div><span></span>${esc(l)}</div>`).join("")}</div>`;
const sheetHead = (title, sub) => `<div class="sheet-head"><div class="sheet-school">${esc(state.settings.school)}</div><div class="sheet-title">${esc(title)}</div>${sub ? `<div class="sheet-sub">${sub}</div>` : ""}</div>`;

VIEWS.receipt = (id) => {
  const x = state.payments.find((y) => y.id === id);
  const back = state.role === "admin" ? ["#/fees", t("Back to fees")] : ["#/fees", t("Back to fees")];
  if (!x) return `<div class="page">${head(t("Receipt not found"), "", "", back)}</div>`;
  const st = getStudent(x.studentId);
  return `<div class="page">${printBar(back)}
    <div class="sheet receipt">${sheetHead(t("Money receipt"))}
      <dl class="sheet-info"><dt>${t("Receipt no.")}</dt><dd class="mono">${x.receiptNo}</dd><dt>${t("Date")}</dt><dd>${fmtDate(x.paidOn)}</dd>
        <dt>${t("Student")}</dt><dd>${esc(st?.name ?? t("Former student"))}</dd><dt>${t("Student ID")}</dt><dd>${st ? latin(esc(st.id.toUpperCase())) : "—"}</dd>
        <dt>${t("Class")}</dt><dd>${st ? esc(classLabel(st.classId, st.section)) : "—"}</dd><dt>${t("Roll")}</dt><dd>${st?.roll ?? "—"}</dd></dl>
      <table class="sheet-tbl"><thead><tr><th>${t("For")}</th><th class="num">${t("Amount")}</th></tr></thead><tbody>
        ${x.items.map((i) => { const c = getCharge(i.chargeId); return `<tr><td>${c ? esc(chargeLabel(c)) : "—"}</td><td class="num">${money(i.amount)}</td></tr>`; }).join("")}
        <tr class="total"><td>${t("Total paid")}</td><td class="num">${money(x.amount)}</td></tr></tbody></table>
      <div class="sheet-note">${t("Paid by {method}", { method: esc(L(x.method)) })}${x.note ? ` · ${esc(x.note)}` : ""}${st ? ` · ${t("Still due: {amount}", { amount: money(studentDue(st.id)) })}` : ""}</div>
      ${signLine([x.receivedBy === "online" ? t("Paid online") : t("Received by")])}</div></div>`;
};

// #/print/cards/<class>/<section>/<term>, #/print/tabulation/…, or a family's #/print/card/<term>.
VIEWS.print = (kind, a, b, c) => {
  if (state.role === "student") {
    const s = childOf(), tm = a;
    return `<div class="page">${printBar(["#/reports", t("Back to report card")])}${resultCard(s, tm)}</div>`;
  }
  const [cid, sec, tm] = [a, b, c];
  const back = ["#/results", t("Back to results")];
  if (!getClass(cid)) return `<div class="page">${head(t("Class not found"), "", "", back)}</div>`;
  const studs = sectionStudents(cid, sec);
  return `<div class="page">${printBar(back)}${kind === "tabulation" ? tabulationSheet(cid, sec, tm) : studs.map((s) => resultCard(s, tm)).join("") || emptyBox(t("No students"), "")}</div>`;
};
// One student's mark sheet for a term.
function resultCard(s, tm) {
  const r = studentResult(s.id, tm), pos = positionOf(s.id, tm), n = sectionRanking(s.classId, s.section, tm).length;
  const withParts = r.rows.some((x) => x.exam.parts.length);
  const g = groupOf(s.classId, s.section);
  return `<div class="sheet">${sheetHead(t("Result card"), `${esc(term(tm))} · ${esc(state.settings.year)}`)}
    <dl class="sheet-info"><dt>${t("Name")}</dt><dd>${esc(s.name)}</dd><dt>${t("Student ID")}</dt><dd>${latin(esc(s.id.toUpperCase()))}</dd>
      <dt>${t("Class")}</dt><dd>${esc(classLabel(s.classId, s.section))}${g ? ` · ${esc(groupLabel(g))}` : ""}</dd><dt>${t("Roll")}</dt><dd>${s.roll}</dd>
      <dt>${t("Guardian")}</dt><dd>${esc(s.guardian ?? "")}</dd><dt>${t("Attendance")}</dt><dd>${studentRate(s.id) ?? "–"}%</dd></dl>
    <table class="sheet-tbl"><thead><tr><th>${t("Subject")}</th><th class="num">${t("Full marks")}</th>${withParts ? ["cq", "mcq", "prac"].map((k) => `<th class="num">${esc(t(PART_SHORT[k]))}</th>`).join("") : ""}<th class="num">${t("Obtained")}</th><th class="num">${t("Grade")}</th>${hasPoints() ? `<th class="num">${t("Point")}</th>` : ""}</tr></thead><tbody>
      ${r.rows.map((x) => `<tr><td>${esc(subj(x.subject))}${x.optional ? ` <small>(${t("4th subject")})</small>` : ""}</td><td class="num">${x.full}</td>
        ${withParts ? ["cq", "mcq", "prac"].map((k) => { const part = x.exam.parts.find((y) => y.key === k); return `<td class="num ${x.failedParts.includes(k) ? "fail" : ""}">${part ? x.parts?.[k] ?? "—" : ""}</td>`; }).join("") : ""}
        <td class="num">${x.got ?? "—"}</td><td class="num ${x.grade && gradeTone(x.grade) === "g-fail" ? "fail" : ""}">${x.grade ? esc(t.grade(x.grade)) : "—"}</td>${hasPoints() ? `<td class="num">${x.grade && x.point !== "" ? Number(x.point).toFixed(2) : "—"}</td>` : ""}</tr>`).join("")}
      <tr class="total"><td>${t("Total")}</td><td class="num">${r.fullTotal}</td>${withParts ? "<td></td><td></td><td></td>" : ""}<td class="num">${r.total}</td><td class="num">${r.grade ? esc(t.grade(r.grade)) : "—"}</td>${hasPoints() ? `<td class="num">${gpaText(r)}</td>` : ""}</tr></tbody></table>
    <div class="sheet-summary"><span>${hasPoints() ? `${t("GPA")} <b>${gpaText(r)}</b>` : ""}</span><span>${t("Grade")} <b>${r.grade ? esc(t.grade(r.grade)) : "–"}</b></span><span>${t("Result")} <b>${!r.done ? "–" : r.passed ? t("Passed") : t("Failed")}</b></span><span>${t("Position in section")} <b>${pos ? `${t.ordinal(pos)} ${t("of {n}", { n })}` : "–"}</b></span></div>
    ${r.rows.some((x) => x.optional) ? `<div class="sheet-note">${t("4th subject: only the points above 2.00 count toward GPA, and failing it doesn't fail the result.")}</div>` : ""}
    ${signLine([t("Class teacher"), t("Guardian"), t("Principal")])}</div>`;
}
// A section's results for a term on one landscape page.
function tabulationSheet(cid, sec, tm) {
  const studs = sectionStudents(cid, sec);
  const exams = state.exams.filter((e) => e.term === tm && e.classId === cid && studs.some((s) => takesExam(s, e))).sort((a, b) => a.date.localeCompare(b.date));
  const ranking = sectionRanking(cid, sec, tm);
  const rows = studs.map((s) => ({ s, r: studentResult(s.id, tm), pos: ranking.findIndex((x) => x.s.id === s.id) + 1 }));
  const sat = rows.filter((x) => x.r.done), passed = sat.filter((x) => x.r.passed);
  const g = groupOf(cid, sec);
  return `<div class="sheet landscape">${sheetHead(t("Tabulation sheet"), `${esc(classLabel(cid, sec))}${g ? ` · ${esc(groupLabel(g))}` : ""} · ${esc(term(tm))} · ${esc(state.settings.year)}`)}
    <table class="sheet-tbl tab"><thead><tr><th class="num">${t("Roll")}</th><th>${t("Name")}</th>${exams.map((e) => `<th class="num">${esc(subj(e.subject))}<small>${e.fullMarks}</small></th>`).join("")}<th class="num">${t("Total")}</th>${hasPoints() ? `<th class="num">${t("GPA")}</th>` : ""}<th class="num">${t("Grade")}</th><th class="num">${t("Pos.")}</th></tr></thead><tbody>
      ${rows.map(({ s, r, pos }) => `<tr><td class="num">${s.roll}</td><td>${esc(s.name)}</td>${exams.map((e) => { const x = r.rows.find((y) => y.exam.id === e.id); return !x ? `<td class="num muted">·</td>` : `<td class="num ${x.grade && gradeTone(x.grade) === "g-fail" ? "fail" : ""}">${x.got ?? "—"}<small>${x.grade ? esc(t.grade(x.grade)) : ""}</small></td>`; }).join("")}
        <td class="num"><b>${r.done ? r.total : "—"}</b></td>${hasPoints() ? `<td class="num">${gpaText(r)}</td>` : ""}<td class="num ${r.done && !r.passed ? "fail" : ""}">${r.grade ? esc(t.grade(r.grade)) : "—"}</td><td class="num">${pos || "—"}</td></tr>`).join("")}</tbody></table>
    <div class="sheet-summary"><span>${t("Sat the exam")} <b>${sat.length}</b></span><span>${t("Passed")} <b>${passed.length}</b></span><span>${t("Failed")} <b>${sat.length - passed.length}</b></span><span>${t("Pass rate")} <b>${pct(passed.length, sat.length)}%</b></span></div>
    ${signLine([t("Class teacher"), t("Principal")])}</div>`;
}

// ---------- Year-end promotion (admin) ----------
// Pick the exam the promotion goes by (usually the annual exam). Students
// who passed are ticked; tick a failed student to promote them on
// consideration. New roll numbers follow merit (lib/school/results.js).
VIEWS.promotion = () => {
  const withMarks = terms().filter((x) => termHasMarks(x));
  if (!withMarks.length) return `<div class="page">${head(t("Year-end promotion"))}${emptyBox(t("No exam results yet"), t("Promotion goes by an exam's results. Enter the marks first."))}</div>`;
  const tm = withMarks.includes(ui.prTerm) ? ui.prTerm : withMarks.includes("Annual Examination") ? "Annual Examination" : withMarks.at(-1);
  if (ui.prFor !== tm) { ui.promo = {}; ui.prFor = tm; }
  const results = Object.fromEntries(state.students.map((s) => [s.id, studentResult(s.id, tm)]));
  const plan = planPromotion({ classes: state.classes, students: state.students, results, choices: ui.promo });
  const moveOf = Object.fromEntries(plan.moves.map((m) => [m.studentId, m]));
  const promoted = (s) => (ui.promo[s.id]?.promote ?? results[s.id].passed);
  const nextYear = Number(state.settings.year) + 1;
  const nUp = state.students.filter((s) => promoted(s) && nextClassOf(state.classes, getClass(s.classId))).length;
  const nOut = plan.passedOut.length, nStay = state.students.length - nUp - nOut;
  const cards = [...sortedClasses()].reverse().map((c) => {
    const next = nextClassOf(state.classes, c);
    const studs = sectionStudents(c.id).slice().sort((a, b) => byMerit(results[a.id], results[b.id]) || a.roll - b.roll);
    if (!studs.length) return "";
    const failed = studs.filter((s) => !results[s.id].passed), considered = failed.filter(promoted);
    return `<div class="card card-pad"><div class="card-head"><span class="card-title">${esc(L(c.name))} → ${next ? esc(L(next.name)) : t("Passed out")}</span>
      <span class="pill-static">${t("{p} passed · {f} failed", { p: studs.length - failed.length, f: failed.length })}${considered.length ? ` · ${t("{n} on consideration", { n: considered.length })}` : ""}</span></div>
      ${table([[t("Merit"), "num"], t("Student"), [t("GPA"), "num"], [t("Grade"), "num"], t("Result"), t("Promote"), ...(next ? [t("New section"), [t("New roll"), "num"]] : [])], studs.map((s, i) => {
        const r = results[s.id], on = promoted(s), m = moveOf[s.id];
        const res = !r.done ? `<span class="pill">${t("No result")}</span>` : r.passed ? `<span class="pill green">${t("Passed")}</span>` : `<span class="pill red">${t("Failed")}</span>`;
        return `<tr class="${on ? "" : "muted-row"}"><td class="num mono">${r.done ? i + 1 : "—"}</td><td><div class="nm">${esc(s.name)}</div><span class="sub-l">${esc(classLabel(s.classId, s.section))} · ${t("Roll {roll}", { roll: s.roll })}</span></td>
          <td class="num mono">${gpaText(r)}</td><td class="num">${r.grade ? gradeTag(r.grade) : "—"}</td><td>${res}${on && !r.passed ? ` <span class="pill amber">${t("On consideration")}</span>` : ""}</td>
          <td><input type="checkbox" class="checkbox" data-action="promo-toggle" data-sid="${s.id}" aria-label="${esc(t("Promote"))}" ${on ? "checked" : ""} /></td>
          ${next ? `<td>${on && next.sections.length > 1 ? sel("promoSec", next.sections.map((x) => [x, x]), m?.section, `data-promo-sec="${s.id}" style="height:36px;min-width:72px"`) : on ? esc(m?.section ?? "") : "—"}</td><td class="num mono">${on ? m?.roll ?? "—" : `<span class="muted">${t("Stays")}</span>`}</td>` : ""}</tr>`;
      }))}</div>`;
  }).join("");
  return `<div class="page">
    ${head(t("Year-end promotion"), t("Move students up a class for the new year. Roll numbers in each section are set by merit in the chosen exam; students who repeat a class come after."))}
    <div class="toolbar">${selectFilter("prTerm", t("Promote by"), termOptions(withMarks), tm)}</div>
    <div class="card card-pad notice-bar"><span class="item-tile">${icon("award", "")}</span><div class="item-text"><span class="t">${esc(t("{up} promoted · {stay} stay in their class · {out} pass out", { up: nUp, stay: nStay, out: nOut }))}</span>
      <span class="m">${esc(t("Afterwards the academic year becomes {year}. This year's exams and results are kept but no longer shown.", { year: nextYear }))}</span></div>
      <button class="btn primary" data-action="run-promotion" data-term="${esc(tm)}">${t("Promote students")}</button></div>
    <div class="stack">${cards}</div>
  </div>`;
};

// ---------- Website (admin) ----------
// The public website's own content, and the enquiries people send from it.
// Lists are one item per line; "a | b" lines have columns.
const WEB_FIELDS = [
  ["School details", "Shown in the website's header, footer and contact page.", [
    ["schoolType", "School type", "select", "", "Decides what the website must publish."],
    ["tagline", "Tagline", "input", "e.g. Learning with care since 1985"], ["eiin", "EIIN", "input"], ["schoolCode", "School code", "input"],
    ["established", "Established (year)", "input", "e.g. 1985"], ["board", "Education board", "input", "e.g. Board of Intermediate and Secondary Education, Dhaka"],
    ["recognition", "Recognition and MPO status", "input", "e.g. Recognised 1990, MPO enlisted 1994"],
    ["headPhone", "Head of school's phone", "input"], ["headEmail", "Head of school's email", "input"],
    ["address", "Address", "input"], ["phone", "Phone", "input"], ["email", "Email", "input"], ["officeHours", "Office hours", "input", "e.g. Sunday to Thursday, 8:00 AM – 3:00 PM"],
    ["facebook", "Facebook page", "input", "https://www.facebook.com/…"],
    ["mapUrl", "Google Maps link", "input", "https://www.google.com/maps/embed?…", "In Google Maps: Share → Embed a map, and copy the address inside src=\"…\". Any other Maps link shows as a button."],
    ["heroImage", "Main photo (address)", "input", "https://…", "A wide photo of the school. Leave empty for sample photos."],
  ]],
  ["About the school", "", [
    ["principalMessage", "Message from the Principal", "area"], ["history", "History", "area"], ["mission", "Mission", "area"], ["vision", "Vision", "area"],
    ["facilities", "Facilities", "list", "One per line"], ["committee", "Managing committee", "list", "Name | Position, one per line"], ["achievements", "Achievements", "list", "One per line"],
  ]],
  ["Admission", "", [
    ["admissionOpen", "Admission is open", "check"], ["admissionSession", "Session (year)", "input", "e.g. 2027"], ["admissionDeadline", "Last date to apply", "date"],
    ["admissionEligibility", "Who can apply", "area"], ["admissionDocuments", "Documents needed", "list", "One per line"], ["admissionSteps", "How to apply", "list", "One step per line"],
    ["admissionSeats", "Seats", "list", "Class | Seats, one class per line"], ["admissionFees", "Admission and other fees", "list", "Fee | Amount, one per line, e.g. Admission fee | ৳3,000"],
    ["admissionNotice", "Admission notice (link)", "input", "https://…", "A link to the notice, e.g. a PDF on Google Drive."],
    ["admissionApplyUrl", "Apply online (link)", "input", "https://…", "Where to apply online, e.g. the government lottery site."],
  ]],
  ["Right to Information and government pages", "Government and MPO schools must name an information officer and an appeal authority under the Right to Information Act 2009. Government schools also publish a citizen's charter and their GRS and NIS focal points.", [
    ["rtiOfficer", "Information officer (RTI)", "input", "Name | Post | Phone | Email", "Name | Post | Phone | Email"],
    ["rtiAppeal", "Appeal authority (RTI)", "input", "Name | Post | Phone | Email", "Name | Post | Phone | Email"],
    ["citizenCharter", "Citizen's charter", "list", "Service | How to get it | Time | Cost, one service per line"],
    ["grsOfficer", "Grievance (GRS) focal point", "input", "Name | Post | Phone | Email", "Name | Post | Phone | Email"],
    ["nisOfficer", "Integrity (NIS) focal point", "input", "Name | Post | Phone | Email", "Name | Post | Phone | Email"],
  ]],
  ["Calendar and downloads", "", [
    ["calendar", "Academic calendar", "list", "Date | Event, one per line, e.g. 2026-12-16 | Victory Day, or 2026-12-20 to 2026-12-31 | Winter vacation"],
    ["downloads", "Downloads", "list", "Title | Link, one per line, e.g. Admission form | https://…"],
  ]],
  ["Results and photos", "", [
    ["results", "SSC results", "list", "Year | Examinees | Passed | GPA 5, one year per line"],
    ["gallery", "Photos", "list", "Photo address | Caption, one per line. Until you add some, the website shows sample photos."],
    ["showTeachers", "Show teachers on the website", "check", "", "Names and subjects only, never phone numbers."],
    ["showStudentCounts", "Show students per class", "check", "", "Boys and girls in each class, as numbers only."],
  ]],
];
function webField(w, [key, label, kind, placeholder = "", hint = ""]) {
  const phAttr = placeholder ? ph(t(placeholder)) : "";
  if (kind === "check") return `<div class="check-row span-2"><div><div class="t">${t(label)}</div>${hint ? `<div class="d">${t(hint)}</div>` : ""}</div><input type="checkbox" class="checkbox" name="${key}" ${w[key] ? "checked" : ""} /></div>`;
  const input = kind === "input" ? inp(key, w[key], phAttr) : kind === "date" ? inp(key, w[key], 'type="date"')
    : kind === "select" ? sel(key, [["", t("Choose…")], ...SCHOOL_TYPES.map((v) => [v, t(SCHOOL_TYPE_LABELS[v])])], w[key])
    : `<textarea class="input textarea" name="${key}" rows="${kind === "list" ? 5 : 4}" ${phAttr}>${esc(w[key])}</textarea>`;
  const f = field(t(label), input, hint ? t(hint) : kind === "list" && placeholder ? t(placeholder) : "");
  return kind === "input" && !hint ? f : `<div class="span-2">${f}</div>`;
}
// What this school's website must publish, ticked off as it's filled in.
function webChecklist(w) {
  const list = websiteChecklist(w), missing = list.filter((x) => x.required && !x.done).length;
  const row = (x) => `<div class="web-check ${x.done ? "done" : x.required ? "missing" : ""}">${icon(x.done ? "check" : "alert")}<span>${t(x.label)}</span>${x.required ? "" : `<small>${t("Recommended")}</small>`}</div>`;
  return `<div class="card card-pad" style="margin-bottom:14px"><div class="card-head"><span class="card-title">${t("What the website must show")}</span>
    <span class="pill ${missing ? "amber" : "green"}">${missing ? t("{n} missing", { n: missing }) : t("All done")}</span></div>
    <div class="desc">${w.schoolType ? t("For a {type}, by the Right to Information Act, DSHE and the admission policy.", { type: t(SCHOOL_TYPE_LABELS[w.schoolType]).toLowerCase() }) : t("Choose the school type below to see what applies.")}</div>
    <div class="web-checks">${list.filter((x) => x.required).map(row).join("")}${list.filter((x) => !x.required).map(row).join("")}</div></div>`;
}
VIEWS.website = () => {
  const w = state.website.content, enq = state.website.enquiries;
  const open = enq.filter((e) => !e.handled).length;
  return `<div class="page narrow">
    ${head(t("Website"), t("The school's public website. Notices for everyone, teachers, classes, fees, school hours and the exam routine come from Scholar; fill in the rest here."), `<a class="btn lg" href="/" target="_blank" rel="noopener">${t("Open the website")}</a>`)}
    ${webChecklist(w)}
    <div class="card card-pad" style="margin-bottom:14px"><div class="card-head"><span class="card-title">${t("Enquiries")} ${open ? `<span class="nav-badge" style="margin:0">${open}</span>` : ""}</span><span class="pill-static">${t("From the website's forms")}</span></div>
      <div class="list">${enq.map((e) => `<div class="item"><span class="item-text"><span class="t">${esc(e.name)} · ${latin(esc(e.phone))}${e.className ? ` · ${esc(L(e.className))}` : ""}</span>
        <span class="m">${e.kind === "admission" ? t("Admission") : e.kind === "rti" ? t("Information request (RTI)") : t("Contact")} · ${fmtDate(e.createdAt.slice(0, 10))}${e.message ? ` · ${esc(e.message)}` : ""}</span></span>
        ${e.handled ? `<span class="pill green">${t("Followed up")}</span>` : `<span class="pill amber">${t("New")}</span>`}
        <button type="button" class="btn sm" data-action="enquiry-handle" data-id="${e.id}">${e.handled ? t("Mark as new") : t("Mark followed up")}</button>
        <button type="button" class="btn sm ghost" data-action="enquiry-delete" data-id="${e.id}">${t("Remove")}</button></div>`).join("") || `<div class="muted">${t("No enquiries yet.")}</div>`}</div></div>
    <form id="websiteForm" autocomplete="off">
      ${WEB_FIELDS.map(([title, desc, fields]) => `<div class="card panel"><h3>${t(title)}</h3>${desc ? `<div class="desc">${t(desc)}</div>` : ""}
        <div class="web-grid">${fields.map((f) => webField(w, f)).join("")}</div></div>`).join("")}
      <div class="err" id="websiteErr" hidden></div>
      <div class="form-actions"><button class="btn primary">${t("Save website")}</button><a class="btn lg" href="/" target="_blank" rel="noopener">${t("Open the website")}</a></div>
    </form>
  </div>`;
};
MOUNTS.website = (root) => {
  const f = $("#websiteForm", root);
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#websiteErr", f);
    const v = Object.fromEntries(WEB_FIELDS.flatMap(([, , fields]) => fields).map(([key, , kind]) => [key, kind === "check" ? f[key].checked : f[key].value]));
    whileBusy(f, async () => {
      try { await mutate("website.save", v); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; return; }
      err.hidden = true; toast(t("Website saved"));
    });
  });
};

// ---------- SMS (admin) ----------
const SMS_KIND = { absent: "Absence", fees: "Fee reminder", result: "Result", notice: "Notice", custom: "Message" };
const SMS_STATUS = { sent: ["green", "Sent"], pending: ["blue", "Sending"], failed: ["red", "Failed"], not_sent: ["amber", "Not sent"], invalid: ["red", "No number"] };
// Bangla needs Unicode SMS: 70 characters a part (67 when split), else 160 (153).
function smsCount(text) {
  const unicode = /[^\x00-\x7F]/.test(text), n = [...text].length;
  const [one, many] = unicode ? [70, 67] : [160, 153];
  return { n, parts: !n ? 0 : n <= one ? 1 : Math.ceil(n / many), unicode };
}
VIEWS.sms = () => {
  const box = state.sms, set = box.settings;
  const kind = ui.smsKind || "";
  const list = box.outbox.filter((m) => !kind || m.kind === kind);
  const counts = (st) => box.outbox.filter((m) => m.status === st).length;
  return `<div class="page">
    ${head(t("SMS"), t("Messages to guardians' phones: absences, results, fee reminders, notices and your own messages."))}
    <div class="card card-pad notice-bar"><span class="item-tile">${icon("chat", "")}</span><div class="item-text"><span class="t">${box.configured ? t("Sending through BulkSMSBD") : t("No SMS gateway is set up yet")}</span>
      <span class="m">${box.configured ? t("Messages go out as soon as they're created. Failed ones show the gateway's reason below.") : t("Messages are kept in the outbox below but not sent. To send them, add BULKSMSBD_API_KEY and BULKSMSBD_SENDER_ID to the server's environment.")}</span></div></div>
    <div class="grid-2 stretch">
      <form class="card panel" id="smsForm" autocomplete="off"><h3>${t("Send a message")}</h3><div class="desc">${t("To the guardians of every student, a class or a section.")}</div>
        <div class="fields-2" style="margin-top:18px">${field(t("To"), sel("classId", [["", t("All guardians")], ...sortedClasses().map((c) => [c.id, L(c.name)])], ""))}${field(t("Section"), sel("section", [["", t("All sections")]], ""))}</div>
        ${field(t("Message"), `<textarea class="input textarea" name="body" maxlength="600" ${ph(t("e.g. School is closed tomorrow for the national holiday."))}></textarea>`, `<span id="smsCount">${t("{n} characters · {parts} SMS each", { n: 0, parts: 0 })}</span>`)}
        <div class="err" id="smsErr" hidden></div>
        <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary">${t("Send")}</button></div></form>
      <form class="card panel" id="smsSettings"><h3>${t("Automatic SMS")}</h3><div class="desc">${t("Sent to guardians without anyone pressing a button.")}</div>
        <div class="check-row"><div><div class="t">${t("When a student is absent")}</div><div class="d">${t("When the roll call for today is saved. Once a day per student.")}</div></div><input type="checkbox" class="checkbox" name="absent" ${set.absent ? "checked" : ""} /></div>
        <div class="check-row"><div><div class="t">${t("When results are published")}</div><div class="d">${t("Each student's GPA and grade. Once per exam.")}</div></div><input type="checkbox" class="checkbox" name="results" ${set.results ? "checked" : ""} /></div>
        ${field(t("SMS language"), sel("lang", [["bn", "বাংলা"], ["en", "English"]], set.lang), t("Bangla SMS hold 70 characters each, English 160."))}
        <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary">${t("Save")}</button></div></form>
    </div>
    <div class="card card-pad"><div class="card-head"><span class="card-title">${t("Outbox")}</span><span class="pill-static">${t("{sent} sent · {not} not sent · {failed} failed", { sent: counts("sent"), not: counts("not_sent"), failed: counts("failed") + counts("invalid") })}</span></div>
      <div class="toolbar">${selectFilter("smsKind", t("Kind"), [["", t("All")], ...Object.entries(SMS_KIND).map(([k, l]) => [k, t(l)])], kind)}${searchBox("smsTbl", t("Search"), true)}</div>
      ${table([t("When"), t("To"), t("Kind"), t("Message"), [t("Status"), "r"]], list.map((m) => { const [tone, label] = SMS_STATUS[m.status] ?? ["", m.status]; return `<tr data-s="${esc(`${m.name ?? ""} ${m.phone} ${m.body}`.toLowerCase())}">
        <td class="mono t2 nowrap">${fmtDate(m.createdAt.slice(0, 10))}<span class="sub-l">${t12(new Date(m.createdAt).toTimeString().slice(0, 5))}</span></td>
        <td>${esc(m.name ?? "—")}<span class="sub-l">${latin(esc(m.phone || "—"))}</span></td><td class="t2">${esc(t(SMS_KIND[m.kind] ?? m.kind))}</td>
        <td class="sms-body" title="${esc(m.body)}">${esc(m.body)}</td><td class="r"><span class="pill ${tone}" title="${esc(m.error)}">${esc(t(label))}</span></td></tr>`; }), t("No messages yet."), "smsTbl")}
    </div>
  </div>`;
};
MOUNTS.sms = (root) => {
  const f = $("#smsForm", root), count = $("#smsCount", root);
  f.classId.addEventListener("change", () => { const c = getClass(f.classId.value); f.section.innerHTML = [["", t("All sections")], ...(c?.sections ?? []).map((x) => [x, x])].map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(""); });
  f.body.addEventListener("input", () => { const c = smsCount(f.body.value); count.textContent = t("{n} characters · {parts} SMS each", { n: c.n, parts: c.parts }); });
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#smsErr", f), body = f.body.value.trim();
    if (!body) { err.textContent = t("Write the message."); err.hidden = false; return; }
    whileBusy(f, async () => {
      let r;
      try { r = await mutate("sms.send", { classId: f.classId.value || null, section: f.section.value || null, body }); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; return; }
      toast(t("{n} messages added to the outbox", { n: r.sent })); route();
    });
  });
  const st = $("#smsSettings", root);
  st.addEventListener("submit", (e) => { e.preventDefault(); whileBusy(st, () => act("sms.settings", { absent: st.absent.checked, results: st.results.checked, lang: st.lang.value }, () => toast(t("SMS settings saved")))); });
};

// ---------- Notices ----------
VIEWS.notices = () => {
  const list = state.notices.slice().sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="page narrow">
    ${head(t("Notice Board"), t("School announcements for students, guardians and staff."), state.role === "admin" ? `<button class="btn primary" data-action="new-notice">${plus} ${t("Post notice")}</button>` : "")}
    <div class="toolbar">${searchBox("noticeList", t("Search notices"))}</div>
    <div class="card card-pad"><div class="list" id="noticeList">${list.map((n) => noticeItem(n).replace('class="item"', `class="item" data-s="${esc(`${n.topic} ${n.body} ${n.number}`.toLowerCase())}"`).replace(`<span class="m">`, `<span class="b">${esc(n.body.slice(0, 140))}${n.body.length > 140 ? "…" : ""}</span><span class="m">`)).join("") || `<div class="muted">${t("No notices yet.")}</div>`}</div></div>
  </div>`;
};

// ---------- Attendance ----------
VIEWS.attendance = (cid, sec, date) => state.role === "student" ? attendanceParent() : attendanceTeacher(cid, sec, date);
// Roll call. A teacher takes it for the sections they're class teacher of;
// the admin can take any section's (and is the only one for sections that
// have no class teacher yet).
function attendanceTeacher(cidP, secP, dateP) {
  const admin = state.role === "admin";
  const secs = admin ? allSections() : classTeacherOf(state.personas.teacher);
  if (!secs.length) return `<div class="page">${head(t("Attendance"))}${emptyBox(t("You're not a class teacher"), t("Attendance is taken by each section's class teacher. The school office assigns class teachers in Class Setup."))}</div>`;
  const date = dateP && dateP <= today() ? dateP : (isSchoolDay(today()) ? today() : shiftSchoolDays(today(), -1));
  const dow = dateObj(date).getDay();
  const pickDefault = (admin && unassignedSections()[0]) || secs[0];
  const [cid, sec] = secs.find(([c, s]) => c === cidP && s === secP) || pickDefault;
  const ctName = getTeacher(classTeacherId(cid, sec))?.name;
  const studs = sectionStudents(cid, sec);
  const rec = state.attendance[attKey(date, cid, sec)];
  const draft = ui.attDraft && ui.attDraft.key === attKey(date, cid, sec) ? ui.attDraft.marks : { ...(rec || Object.fromEntries(studs.map((s) => [s.id, "P"]))) };
  ui.attDraft = { key: attKey(date, cid, sec), marks: draft };
  const counts = { P: 0, A: 0, L: 0 }; studs.forEach((s) => counts[draft[s.id] || "P"]++);
  const low = studs.map((s) => ({ s, r: studentRate(s.id) })).filter((x) => x.r !== null && x.r < state.settings.threshold).sort((a, b) => a.r - b.r);
  const school = isSchoolDay(date);
  const who = ctName ? t("Class teacher: {name}.", { name: esc(ctName) }) : admin ? t("This section has no class teacher, so the office takes it.") : "";
  return `<div class="page">
    ${head(t("Attendance"), `${t("Roll call for {class} on {day}.", { class: esc(classLabel(cid, sec)), day: fmtDay(date) })} ${who}`)}
    <div class="toolbar">
      ${selectFilter("attSection", t("Section"), secs.map(([c, s]) => [`${c}|${s}`, `${classLabel(c, s)}${admin && !classTeacherId(c, s) ? ` (${t("no class teacher")})` : ""}`]), `${cid}|${sec}`)}
      <label class="filter sm">${t("Date")} <input type="date" class="mono" data-att-date value="${date}" max="${today()}" style="border:0;background:none;outline:0;color:var(--text);font-weight:500" /></label>
      ${rec ? `<span class="pill green">${t("Taken by {name}", { name: esc(takenByName(state.attendanceBy?.[attKey(date, cid, sec)])) })}</span>` : `<span class="pill amber">${t("Not taken yet")}</span>`}
    </div>
    ${!school ? emptyBox(t("No school on {day}", { day: dayName(dow) }), t("Pick a school day: {days}.", { days: schoolDaysLabel() })) : `
    <div class="grid-main">
      <div class="card card-pad">
        <div class="card-head"><span class="card-title">${esc(classLabel(cid, sec))} <span class="pill-static">${t("{n} students", { n: studs.length })}</span></span><button class="btn sm" data-action="att-all-present">${t("Mark all present")}</button></div>
        <div class="roster">${studs.map((s) => { const v = draft[s.id] || "P"; return `<div class="roster-row"><span class="roll">${t("Roll {roll}", { roll: s.roll })}</span><div class="who">${avatar(s.name, s.id)}<div><div class="nm">${esc(s.name)}</div><div class="em">${t("{r}% attendance", { r: studentRate(s.id) ?? "–" })}</div></div></div>
          <div class="pal">${["P", "A", "L"].map((k) => `<button type="button" class="${k} ${v === k ? "on" : ""}" data-action="att-mark" data-sid="${s.id}" data-v="${k}" title="${esc(t(MARK_LABEL[k]))}">${t(`mark:${k}`)}</button>`).join("")}</div></div>`; }).join("")}</div>
        <div class="form-actions" style="margin-top:18px"><button class="btn primary" data-action="att-save" data-key="${attKey(date, cid, sec)}">${rec ? t("Update attendance") : t("Save attendance")}</button><span class="hint" style="margin:0">${t("P = present · A = absent · L = late (counts as present)")}</span></div>
      </div>
      <div class="stack">
        <div class="stats" style="--n:3;margin:0">
          <div class="stat"><div class="n">${counts.P}</div><div class="l">${t("Present")}</div></div>
          <div class="stat"><div class="n">${counts.A}</div><div class="l">${t("Absent")}</div></div>
          <div class="stat"><div class="n">${counts.L}</div><div class="l">${t("Late")}</div></div>
        </div>
        <div class="card card-pad"><div class="card-head"><span class="card-title">${t("Below {th}%", { th: state.settings.threshold })}</span><span class="pill-static">${t("Last 30 days")}</span></div>
          ${low.length ? `<div class="list">${low.map(({ s, r }) => `<a class="item" href="#/students/${s.id}">${avatar(s.name, s.id)}<span class="item-text"><span class="t">${esc(s.name)}</span><span class="m">${t("Guardian: {name}", { name: esc(s.guardian) })}</span></span><span class="pill red">${r}%</span></a>`).join("")}</div>` : `<div class="muted">${t("Everyone in this section is above the threshold.")}</div>`}</div>
      </div>
    </div>`}
  </div>`;
}
function attendanceParent() {
  const s = childOf();
  const all = attendanceOf(s.id);
  const map = Object.fromEntries(all);
  const rate = studentRate(s.id);
  const recent = all.filter(([d]) => d >= shiftSchoolDays(today(), -30));
  const count = (k) => recent.filter(([, v]) => v === k).length;
  // Six school weeks, oldest first.
  const start = addDays(today(), -dateObj(today()).getDay() - 35);
  const weeks = [...Array(6)].map((_, w) => schedule().days.map((dd) => addDays(start, w * 7 + dd)));
  const absences = recent.filter(([, v]) => v === "A").reverse();
  return `<div class="page">
    ${head(t("Attendance"), `${esc(s.name)} · ${esc(classLabel(s.classId, s.section))}`)}
    <div class="stats" style="--n:4">
      <div class="stat"><div class="n">${rate ?? "–"}<small>%</small></div><div class="l">${t("Attendance, last 30 days")}</div></div>
      <div class="stat"><div class="n">${count("P")}</div><div class="l">${t("Days present")}</div></div>
      <div class="stat"><div class="n">${count("A")}</div><div class="l">${t("Days absent")}</div></div>
      <div class="stat"><div class="n">${count("L")}</div><div class="l">${t("Days late")}</div></div>
    </div>
    <div class="grid-main">
      <div class="card card-pad"><div class="card-head"><span class="card-title">${t("Last six weeks")}</span></div>
        <div class="cal" style="--days:${schedule().days.length}">${schedule().days.map((d) => `<div class="cal-h">${dayName(d, "short")}</div>`).join("")}
          ${weeks.flat().map((d) => { const v = map[d]; const fut = d > today(); return `<div class="cal-d ${v || ""} ${fut ? "future" : ""} ${!v && !fut ? "none" : ""}" title="${esc(fmtDay(d))}${v ? `: ${esc(t(MARK_LABEL[v]))}` : ""}">${dateObj(d).getDate()}</div>`; }).join("")}</div>
        <div class="legend"><span><i style="background:var(--green-soft)"></i>${t("Present")}</span><span><i style="background:var(--amber-soft)"></i>${t("Late")}</span><span><i style="background:var(--danger)"></i>${t("Absent")}</span><span><i style="border:1px dashed var(--border-strong)"></i>${t("Not recorded")}</span></div></div>
      <div class="card card-pad"><div class="card-head"><span class="card-title">${t("Absences")}</span></div>
        ${absences.length ? `<div class="list">${absences.map(([d]) => `<div class="item"><span class="item-tile date"><b>${dateObj(d).getDate()}</b><small>${shortMonth(dateObj(d))}</small></span><span class="item-text"><span class="t">${dayName(dateObj(d).getDay())}</span><span class="m">${t("Absent all day")}</span></span></div>`).join("")}</div>` : `<div class="muted">${t("No absences in the last 30 school days.")} 🎉</div>`}
      </div>
    </div>
  </div>`;
}

// ---------- Homework ----------
VIEWS.homework = (id) => {
  if (state.role === "teacher") return id ? homeworkDetail(state.homework.find((h) => h.id === id)) : homeworkTeacher();
  const s = childOf();
  const f = ui.hwFilter || "all";
  const all = myHomework(s);
  const st = (h) => hwStatus(h, s.id);
  const open = all.filter((h) => ["pending", "missing"].includes(st(h)));
  const list = all.filter((h) => f === "all" || (f === "open" ? open.includes(h) : !open.includes(h))).sort((a, b) => b.due.localeCompare(a.due));
  return `<div class="page">
    ${head(t("Homeworks"), t("Homework for {class}. Mark it submitted once it's handed in.", { class: esc(classLabel(s.classId, s.section)) }))}
    <div class="toolbar">${seg("hwFilter", [["all", t("All")], ["open", `${t("Not submitted")} <span class="count">${open.length}</span>`], ["done", t("Submitted")]], f)}${searchBox("hwTbl", t("Search homework"))}</div>
    <div class="card card-pad">
      ${table([t("Subject"), t("Topic"), t("Faculty"), t("Due date"), t("Status"), ["", "r"]], list.map((h) => `<tr data-s="${esc(`${subj(h.subject)} ${h.subject} ${h.topic}`.toLowerCase())}"><td class="strong">${esc(subj(h.subject))}</td><td>${esc(h.topic)}</td><td class="mono">${esc(getTeacher(h.teacherId)?.initials ?? "—")}</td><td class="mono">${fmtDate(h.due)}<span class="sub-l">${relDay(h.due)}</span></td><td>${hwPill(st(h))}</td><td class="r"><button class="btn sm" data-action="hw-details" data-id="${h.id}">${t("Details")}</button></td></tr>`), t("Nothing here."), "hwTbl")}
    </div>
  </div>`;
};
function homeworkTeacher() {
  const tid = state.personas.teacher, td = today();
  const f = ui.hwTab || "active";
  const mine = state.homework.filter((h) => h.teacherId === tid);
  const list = mine.filter((h) => (f === "active" ? h.due >= td : h.due < td)).sort((a, b) => (f === "active" ? a.due.localeCompare(b.due) : b.due.localeCompare(a.due)));
  return `<div class="page">
    ${head(t("Homework"), t("Homework you've set, and who has handed it in."), `<button class="btn primary" data-action="add-homework">${plus} ${t("Add homework")}</button>`)}
    <div class="toolbar">${seg("hwTab", [["active", `${t("Active")} <span class="count">${mine.filter((h) => h.due >= td).length}</span>`], ["past", t("Past due")]], f)}</div>
    <div class="card card-pad">
      ${table([t("Topic"), t("Section"), t("Assigned"), t("Due"), t("Submitted"), [t("To review"), "r"]], list.map((h) => {
        const n = subjectStudents(h.classId, h.section, h.subject).length, sub = Object.keys(h.submissions).length, rev = Object.values(h.submissions).filter((x) => !x.reviewed).length;
        return `<tr class="click" data-href="#/homework/${h.id}"><td class="strong">${esc(h.topic)}<span class="sub-l">${esc(subj(h.subject))}</span></td><td>${esc(classLabel(h.classId, h.section))}</td><td class="mono t2">${fmtDate(h.assigned)}</td><td class="mono">${fmtDate(h.due)}<span class="sub-l">${relDay(h.due)}</span></td><td><div class="inline-meter">${meter(pct(sub, n))}<b>${sub}/${n}</b></div></td><td class="r">${rev ? `<span class="pill amber">${rev}</span>` : `<span class="pill green">${t("Done")}</span>`}</td></tr>`;
      }), f === "active" ? t("No active homework. Add one for your section.") : t("Nothing past due."))}
    </div>
  </div>`;
}
function homeworkDetail(h) {
  if (!h) return `<div class="page">${head(t("Homework not found"), "", "", ["#/homework", t("Back to homework")])}</div>`;
  const studs = subjectStudents(h.classId, h.section, h.subject);
  const subs = studs.filter((s) => h.submissions[s.id]);
  const toReview = subs.filter((s) => !h.submissions[s.id].reviewed).length;
  return `<div class="page narrow">
    ${head(h.topic, t("{subject} · {class} · due {date} ({when})", { subject: esc(subj(h.subject)), class: esc(classLabel(h.classId, h.section)), date: fmtDate(h.due), when: relDay(h.due) }), `<button class="btn lg" data-action="edit-homework" data-id="${h.id}">${t("Edit")}</button>`, ["#/homework", t("Back to homework")])}
    <div class="card card-pad" style="margin-bottom:14px"><div class="remark"><b>${t("Instructions")}</b>${esc(h.details)}</div></div>
    <div class="stats" style="--n:3">
      <div class="stat"><div class="n">${subs.length}<small>/ ${studs.length}</small></div><div class="l">${t("Submitted")}</div></div>
      <div class="stat"><div class="n">${toReview}</div><div class="l">${t("Waiting for review")}</div></div>
      <div class="stat"><div class="n">${studs.length - subs.length}</div><div class="l">${h.due < today() ? t("Missing") : t("Not yet submitted")}</div></div>
    </div>
    <div class="card card-pad">
      <div class="card-head"><span class="card-title">${t("Submissions")}</span>${toReview ? `<button class="btn sm" data-action="hw-review-all" data-id="${h.id}">${t("Mark all reviewed")}</button>` : ""}</div>
      <div class="roster">${studs.map((s) => { const x = h.submissions[s.id]; return `<div class="roster-row"><span class="roll">${t("Roll {roll}", { roll: s.roll })}</span><div class="who">${avatar(s.name, s.id)}<div><div class="nm">${esc(s.name)}</div><div class="em">${x ? t("Submitted {date}", { date: fmtDate(x.on) }) : h.due < today() ? t("Missing") : t("Not submitted yet")}</div></div></div>
        <div>${x ? (x.reviewed ? `<button class="btn sm done" data-action="hw-review" data-id="${h.id}" data-sid="${s.id}">✓ ${t("Reviewed")}</button>` : `<button class="btn sm" data-action="hw-review" data-id="${h.id}" data-sid="${s.id}">${t("Mark reviewed")}</button>`) : hwPill(hwStatus(h, s.id))}</div></div>`; }).join("")}</div>
    </div>
  </div>`;
}

// ---------- Settings ----------
VIEWS.settings = () => {
  const k = meKey(), admin = state.role === "admin";
  let pref = "system"; try { pref = localStorage.getItem(THEME_KEY) || "system"; } catch {}
  return `<div class="page narrow">
    ${head(t("Settings"))}
    <form class="card panel" id="profileForm" autocomplete="off">
      <h3>${t("Profile")}</h3><div class="desc">${admin ? t("How your name appears to staff, students and guardians.") : t("Your details are managed by the school office.")}</div>
      <div class="fields-2" style="margin-top:20px">
        <div class="field"><label>${t("Name")}</label><input class="input" name="name" value="${esc(personName(k))}" ${admin ? "" : "readonly"} /></div>
        <div class="field"><label>${t("Role")}</label><input class="input" value="${esc(personRole(k))}" readonly /></div>
      </div>
      ${admin ? `<div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="btn primary">${t("Save profile")}</button></div>` : ""}
    </form>
    <div class="card panel"><h3>${t("Language")}</h3><div class="desc">${t("Show Scholar in English or Bangla. Your choice is saved on this device.")}</div>
      <div style="margin-top:18px">${[["en", "English"], ["bn", "বাংলা"]].map(([v, l]) => `<button type="button" class="btn ${t.lang === v ? "primary" : ""}" style="height:40px;margin-right:6px" data-action="language" data-lang="${v}">${l}</button>`).join("")}</div></div>
    <div class="card panel"><h3>${t("Appearance")}</h3><div class="desc">${t("Pick a colour theme, then light, dark, or follow your device.")}</div>
      <div class="palettes">${Object.entries(palettes()).map(([v, p]) => `<button type="button" class="palette ${v === palettePref() ? "on" : ""}" data-action="palette" data-pal="${v}">
        <span class="sw">${p.swatch.map((c) => `<i style="background:${c}"></i>`).join("")}</span>
        <b>${t(p.label)}<span class="tick">${check}</span></b><small>${t(p.desc)}</small></button>`).join("")}</div>
      <div style="margin-top:18px">${[["light", "Light"], ["dark", "Dark"], ["system", "System"]].map(([p, l]) => `<button type="button" class="btn ${p === pref ? "primary" : ""}" style="height:40px;margin-right:6px" data-action="theme" data-pref="${p}">${t(l)}</button>`).join("")}</div></div>
    ${admin ? `<form class="card panel" id="schoolForm" autocomplete="off"><h3>${t("School")}</h3><div class="desc">${t("Used on reports, notices and alerts.")}</div>
      <div class="fields-3" style="margin-top:20px">
        <div class="field"><label>${t("School name")}</label><input class="input" name="school" value="${esc(state.settings.school)}" /></div>
        <div class="field"><label>${t("Academic year")}</label><input class="input" name="year" value="${esc(state.settings.year)}" /></div>
        <div class="field"><label>${t("Attendance alert below (%)")}</label><input class="input" name="threshold" type="number" min="1" max="100" value="${state.settings.threshold}" /></div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="btn primary">${t("Save school settings")}</button></div></form>
    ${scheduleForm()}
    <div class="card panel"><h3>${t("Optional features")}</h3><div class="desc">${t("Turn on only what your teachers will keep up to date. Turned-off features are hidden for everyone.")}</div>
      ${Object.entries(FEATURES).map(([key, f]) => `<div class="check-row"><div><div class="t">${esc(t(f.label))}</div><div class="d">${esc(t(f.desc))}</div></div><input type="checkbox" class="checkbox" data-action="toggle-feature" data-key="${key}" aria-label="${esc(t(f.label))}" ${feature(key) ? "checked" : ""} /></div>`).join("")}</div>` : ""}
    <form class="card panel" id="passwordForm"><h3>${t("Password")}</h3><div class="desc">${t("You sign in as <b class=\"mono\">{username}</b>. Changing your password signs you out everywhere else.", { username: latin(esc(state.username)) })}</div>
      <div class="fields-2" style="margin-top:20px">
        <div class="field"><label>${t("Current password")}</label><input class="input" name="current" type="password" autocomplete="current-password" required /></div>
        <div class="field"><label>${t("New password")}</label><input class="input" name="next" type="password" autocomplete="new-password" minlength="8" required /><div class="hint">${t("At least 8 characters.")}</div></div>
      </div>
      <div class="err" id="passwordErr" hidden></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px"><button type="button" class="btn lg" data-action="logout">${t("Log out")}</button><button class="btn primary">${t("Change password")}</button></div></form>
    ${admin ? `<div class="card panel"><h3>${t("Demo data")}</h3><div class="desc">${t("The school's data lives in the database and is shared by every account. Reset to start again with the sample school. This also sets every password back to the demo password.")}</div>
      <div style="margin-top:18px"><button class="btn danger lg" style="border:1px solid var(--border-strong)" data-action="reset-data">${t("Reset demo data")}</button></div></div>` : ""}
  </div>`;
};
// The school week and its shifts. Each shift's period times are worked out
// from its start, period length, gaps and break.
function scheduleForm() {
  const sch = schedule(), two = multiShift();
  const shiftFor = (id) => sch.shifts.find((x) => x.id === id) ?? (two ? SHIFT_DEFAULTS[id] : id === "day" ? sch.shifts[0] : SHIFT_DEFAULTS[id]);
  const block = (id) => {
    const x = shiftFor(id);
    const num = (name, label, min, max) => field(label, inp(name, x[name], `type="number" min="${min}" max="${max}" required`));
    return `<div class="shift-block" data-shift="${id}" ${!two && id === "morning" ? "hidden" : ""}>
      <div class="fields-3">${field(t("Shift name"), inp("name", L(x.name), "required"))}${field(t("First period starts"), inp("start", x.start, 'type="time" required'))}${num("count", t("Periods"), 1, 12)}</div>
      <div class="fields-2">${num("length", t("Period length (min)"), 20, 120)}${num("gap", t("Gap between periods (min)"), 0, 30)}</div>
      <div class="fields-2">${field(t("Break"), sel("breakAfter", [[0, t("No break")], ...[...Array(11)].map((_, i) => [i + 1, t("After period {n}", { n: i + 1 })])], x.breakAfter))}${num("breakLength", t("Break length (min)"), 0, 90)}</div>
      <div class="hint shift-preview"></div></div>`;
  };
  return `<form class="card panel" id="scheduleForm" autocomplete="off"><h3>${t("School week & shifts")}</h3>
    <div class="desc">${t("The days the school is open and the periods of each shift. With two shifts, pick each section's shift in Class Setup; teachers can teach in both.")}</div>
    <span class="lbl" style="margin-top:20px;display:block">${t("School days")}</span>
    <div class="day-chips">${[0, 1, 2, 3, 4, 5, 6].map((d) => `<label class="day-chip"><input type="checkbox" name="day" value="${d}" ${sch.days.includes(d) ? "checked" : ""} />${dayName(d)}</label>`).join("")}</div>
    <div class="check-row"><div><div class="t">${t("Two shifts")}</div><div class="d">${t("A morning and a day shift, each with its own sections and times.")}</div></div><input type="checkbox" class="checkbox" name="two" ${two ? "checked" : ""} aria-label="${esc(t("Two shifts"))}" /></div>
    ${["morning", "day"].map(block).join("")}
    <div class="err" id="scheduleErr" hidden></div>
    <div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="btn primary">${t("Save school week")}</button></div></form>`;
}
function readSchedule(form) {
  const two = form.two.checked;
  const days = $$('[name="day"]:checked', form).map((i) => Number(i.value));
  const shifts = $$("[data-shift]", form).filter((b) => two || b.dataset.shift === "day").map((b) => {
    const v = (n) => b.querySelector(`[name="${n}"]`).value;
    const n = (k) => (v(k) === "" ? NaN : Number(v(k)));
    return { id: b.dataset.shift, name: v("name").trim(), start: v("start"), count: n("count"), length: n("length"), gap: n("gap"), breakAfter: n("breakAfter"), breakLength: n("breakLength") };
  });
  return { days, shifts };
}
function mountScheduleForm(form) {
  const preview = () => {
    const sch = readSchedule(form);
    $$("[data-shift]", form).forEach((b) => { b.hidden = !form.two.checked && b.dataset.shift === "morning"; });
    sch.shifts.forEach((x) => {
      const box = $(`[data-shift="${x.id}"] .shift-preview`, form);
      const ok = !scheduleProblem({ days: [0], shifts: [x] });
      box.textContent = ok ? periodsOf(x).map(([a, b], i) => `${i + 1}: ${t12(a)}–${t12(b)}`).join(" · ") : "";
    });
  };
  form.addEventListener("input", preview);
  form.addEventListener("change", preview);
  preview();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#scheduleErr", form), v = readSchedule(form);
    const problem = scheduleProblem(v);
    if (problem) { err.textContent = t(problem); err.hidden = false; return; }
    whileBusy(form, async () => {
      let r;
      try { r = await mutate("schedule.save", v); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; return; }
      err.hidden = true;
      toast(r.removed ? t("School week saved. {n} periods that no longer exist were removed from the timetable.", { n: r.removed }) : t("School week saved"));
      route();
    });
  });
}
MOUNTS.settings = (root) => {
  const sf = $("#scheduleForm", root); if (sf) mountScheduleForm(sf);
  if (state.role === "admin") $("#profileForm", root)?.addEventListener("submit", (e) => {
    e.preventDefault(); const f = e.target, n = f.name.value.trim(); if (!n) return;
    whileBusy(f, () => act("profile.update", { name: n }, () => toast(t("Profile saved"))));
  });
  $("#schoolForm", root)?.addEventListener("submit", (e) => {
    e.preventDefault(); const f = e.target;
    whileBusy(f, () => act("school.update", { school: f.school.value, year: f.year.value, threshold: f.threshold.value }, () => toast(t("School settings saved"))));
  });
  $("#passwordForm", root)?.addEventListener("submit", (e) => {
    e.preventDefault(); const f = e.target, err = $("#passwordErr", f);
    whileBusy(f, async () => {
      try { await mutate("password.change", { current: f.current.value, next: f.next.value }); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; return; }
      f.reset(); err.hidden = true; toast(t("Password changed"));
    });
  });
};

// ======================================================================
// MODALS
// ======================================================================
function openModal({ title, body, submit, onSubmit, onMount, footLeft = "", cancel = t("Cancel"), wide = false }) {
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal ${wide ? "wide" : ""}" id="modalForm" autocomplete="off">
    <div class="modal-head"><h3>${title}</h3><button type="button" class="icon-btn" data-close aria-label="${esc(t("Close"))}">${xIcon}</button></div>
    <div class="modal-body">${body}<div class="err" id="modalErr" hidden></div></div>
    <div class="modal-foot">${footLeft ? `<div class="foot-left">${footLeft}</div>` : ""}<button type="button" class="btn lg" data-close>${cancel}</button>${submit ? `<button class="btn primary">${submit}</button>` : ""}</div>
  </form>`;
  modal.hidden = false;
  const form = $("#modalForm");
  onMount?.(form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    whileBusy(form, async () => {
      let problem;
      try { problem = await onSubmit?.(form); } catch (ex) { problem = ex.message; }
      if (problem) { const er = $("#modalErr"); er.textContent = problem; er.hidden = false; return; }
      closeModal(); route();
    });
  });
  form.querySelector("input:not([readonly]), select, textarea")?.focus();
}
function closeModal() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; }

// ---------- sign-in accounts (admin) ----------
// One row per account: status, and a button for a new one-time code.
function accountItem(key, label) {
  const a = state.accounts?.[key];
  if (!a) return `<div class="item"><span class="item-text"><span class="t">${label}</span><span class="m">${t("No account")}</span></span></div>`;
  const expired = !a.active && a.expires && a.expires < new Date().toISOString();
  const status = a.active ? `<span class="pill green">${t("Active")}</span>` : expired ? `<span class="pill red">${t("Code expired")}</span>` : `<span class="pill amber">${t("Not set up")}</span>`;
  const meta = a.active ? t("Signs in with their own password") : expired ? t("Their activation code has expired") : t("Waiting for activation · code valid until {date}", { date: fmtDate(a.expires.slice(0, 10)) });
  return `<div class="item"><span class="item-text"><span class="t">${label} · <span class="mono" data-latin>${esc(a.username)}</span></span><span class="m">${meta}</span></span>${status}
    <button type="button" class="btn sm" data-action="reset-access" data-key="${esc(key)}">${a.active ? t("Reset access") : t("New code")}</button></div>`;
}
// Codes are only shown here, once; the server keeps just a hash.
function showCodes(title, accounts, intro) {
  const link = `${location.origin}/activate`;
  const label = (a) => t(({ teacher: "Teacher", student: "Student" })[a.role]);
  const until = fmtDate(accounts[0].expires.slice(0, 10));
  ui.codesText = [t("{school} — create your Scholar account at {link}", { school: state.settings.school, link }), ...accounts.map((a) => t("{role} {name}: username {username}, code {code} (valid until {date})", { role: label(a), name: personName(`${a.role[0]}:${a.personId}`), username: a.username, code: a.code, date: fmtDate(a.expires.slice(0, 10)) }))].join("\n");
  openModal({
    title: esc(title), cancel: t("Done"),
    body: `<p class="desc-text">${esc(intro)} ${t("They go to <b>{link}</b>, enter the username and code, and choose a password. Each code works once and expires on {date}.", { link: latin(esc(link)), date: until })}</p>
      <div class="list">${accounts.map((a) => `<div class="item"><span class="item-text"><span class="t">${label(a)} · ${esc(personName(`${a.role[0]}:${a.personId}`))}</span><span class="m">${t("Username")} <b class="mono" data-latin>${esc(a.username)}</b></span></span><span class="code-chip mono" data-latin>${esc(a.code)}</span></div>`).join("")}</div>
      <div class="hint">${t("This is the only time these codes are shown. If one gets lost, issue a new code from the student's profile or the teacher's details.")}</div>`,
    footLeft: `<button type="button" class="btn" data-action="copy-codes">${t("Copy details")}</button>`,
  });
}
// Disable a form's buttons while its request runs, so it can't be sent twice.
async function whileBusy(form, fn) {
  if (form.dataset.busy) return;
  form.dataset.busy = "1";
  const btns = $$("button", form).filter((b) => !b.disabled);
  btns.forEach((b) => { b.disabled = true; });
  try { return await fn(); } finally { delete form.dataset.busy; btns.forEach((b) => { b.disabled = false; }); }
}
const field = (label, input, hint = "") => `<div class="field"><label>${label}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
const sel = (name, options, value, attrs = "") => `<select class="select" name="${name}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const inp = (name, value = "", attrs = "") => `<input class="input" name="${name}" value="${esc(value)}" ${attrs} />`;
const ph = (text) => `placeholder="${esc(text)}"`;

function openStudentModal(s) {
  const c0 = s ? getClass(s.classId) : sortedClasses()[0];
  openModal({
    title: s ? t("Edit student") : t("Add student"),
    body: `${field(t("Full name"), inp("name", s?.name, `${ph(t("e.g. Rafid Ahmed"))} required`))}
      <div class="fields-2">${field(t("Class"), sel("classId", classOptions(false), c0?.id))}${field(t("Section"), sel("section", (c0?.sections || []).map((x) => [x, x]), s?.section))}</div>
      <div class="fields-2">${field(t("Gender"), sel("gender", [["Male", t("Male")], ["Female", t("Female")]], s?.gender))}${field(t("Date of birth"), inp("dob", s?.dob, 'type="date"'))}</div>
      <div class="fields-2">${field(t("Guardian's name"), inp("guardian", s?.guardian, `${ph(t("e.g. Shirin Ahmed"))} required`))}${field(t("Guardian's phone"), inp("phone", s?.phone, ph("+880 1…")))}</div>
      <div class="fields-2">${field(t("Religion"), sel("religion", RELIGIONS.map((r) => [r, religionLabel(r)]), s?.religion ?? "islam"), t("Decides which religion subject they take."))}<div id="optField"></div></div>
      ${field(t("Tuition discount"), sel("discount", [[0, t("None")], [25, "25%"], [50, t("Half (50%)")], [75, "75%"], [100, t("Free studentship (100%)")]], s?.discount ?? 0), t("Taken off the monthly tuition from now on."))}`,
    submit: s ? t("Save") : t("Add student"),
    footLeft: s ? `<button type="button" class="btn danger" data-action="delete-student" data-id="${s.id}">${t("Delete student")}</button>` : "",
    onMount: (f) => {
      // The 4th subject, for sections whose group has a choice.
      const optField = () => {
        const list = optionalChoices(getClass(f.classId.value), f.section.value);
        const cur = f.optional?.value ?? s?.optional ?? "";
        $("#optField", f).innerHTML = list.length ? field(t("4th subject"), sel("optional", [["", t("None")], ...list.map((x) => [x, subj(x)])], list.includes(cur) ? cur : list[0]), t("Only its points above 2.00 count toward GPA.")) : "";
      };
      f.classId.addEventListener("change", () => { const c = getClass(f.classId.value); f.section.innerHTML = c.sections.map((x) => `<option>${esc(x)}</option>`).join(""); optField(); });
      f.section.addEventListener("change", optField);
      optField();
    },
    onSubmit: async (f) => {
      const v = Object.fromEntries(new FormData(f));
      v.optional = v.optional || null;
      if (!v.name.trim() || !v.guardian.trim()) return t("Name and guardian are required.");
      const r = await mutate("student.save", { id: s?.id, ...v });
      if (s) toast(t("Student saved"));
      else setTimeout(() => showCodes(t("{name} added", { name: v.name.trim() }), r.accounts, t("Roll {roll} in {class}. Give the family this code: the student and their guardian share one account.", { roll: r.roll, class: classLabel(v.classId, v.section) })));
    },
  });
}
function openTeacherModal(x) {
  const subjects = ALL_SUBJECTS();
  openModal({
    title: x ? t("Edit teacher") : t("Add teacher"),
    body: `${field(t("Full name"), inp("name", x?.name, `${ph(t("e.g. Sharmin Akter"))} required`))}
      <div class="fields-2">${field(t("Subject"), sel("subject", subjects.map((s) => [s, subj(s)]), x?.subject || "Mathematics"))}${field(t("Initials"), inp("initials", x?.initials, `${ph(t("e.g. SAK"))} maxlength="4"`), t("Shown on routines."))}</div>
      <div class="fields-2">${field(t("Email"), inp("email", x?.email, `type="email" ${ph("name@school.edu")}`))}${field(t("Phone"), inp("phone", x?.phone, ph("+880 1…")))}</div>
      ${x ? `<div class="hint">${t("{n} periods a week · {m} sections. Change their periods from the Timetable.", { n: state.timetable.filter((p) => p.teacherId === x.id).length, m: teacherSections(x.id).length })}</div>
        <div class="list" style="margin-top:6px">${accountItem(`t:${x.id}`, t("Sign-in account"))}</div>` : `<div class="hint">${t("New teachers start with no periods. Assign them from the Timetable. You'll get a one-time code for their account.")}</div>`}`,
    submit: x ? t("Save") : t("Add teacher"),
    footLeft: x ? `<button type="button" class="btn danger" data-action="delete-teacher" data-id="${x.id}">${t("Delete")}</button>` : "",
    onSubmit: async (f) => {
      const v = Object.fromEntries(new FormData(f));
      if (!v.name.trim()) return t("Name is required.");
      const r = await mutate("teacher.save", { id: x?.id, ...v });
      if (x) toast(t("Teacher saved"));
      else setTimeout(() => showCodes(t("{name} added", { name: v.name.trim() }), r.accounts, t("Give the teacher this code so they can create their account.")));
    },
  });
}
function openExamModal(e) {
  const role = state.role;
  let classes = sortedClasses();
  let mine = null;
  if (role === "teacher") { mine = teachingOf(state.personas.teacher); classes = classes.filter((c) => mine.some((x) => x.classId === c.id)); }
  const c0 = e ? getClass(e.classId) : classes[0];
  const subjOpts = (c) => (role === "teacher" ? [...new Set(mine.filter((x) => x.classId === c.id).map((x) => x.subject))] : c.subjects).map((s) => [s, subj(s)]);
  const termList = terms();
  openModal({
    title: e ? t("Edit exam") : t("Create exam"),
    body: `${field(t("Exam / term"), `<input class="input" name="term" list="termList" value="${esc(e?.term ?? (role === "teacher" ? "Class Test" : ""))}" ${ph(t("e.g. Class Test 5"))} required /><datalist id="termList">${termList.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`, t("Pick an existing term to add a subject to it, or type a new one."))}
      <div class="fields-2">${field(t("Class"), sel("classId", classes.map((c) => [c.id, L(c.name)]), c0?.id))}${field(t("Subject"), sel("subject", c0 ? subjOpts(c0) : [], e?.subject))}</div>
      <div class="fields-3">${field(t("Date"), inp("date", e?.date ?? shiftSchoolDays(today(), 5), 'type="date" required'))}${field(t("Start time"), inp("start", e?.start ?? "10:00", 'type="time" required'))}${field(t("Full marks"), inp("fullMarks", e?.fullMarks ?? 100, 'type="number" min="1" required'))}</div>
      <span class="lbl">${t("Parts")}</span>
      <div class="fields-3">${PART_KEYS.map((k) => field(esc(t(PART_LABELS[k])), inp(`part-${k}`, "", 'type="number" min="1" placeholder="—"'))).join("")}</div>
      <div class="hint" style="margin-top:-6px">${t("Split the marks into parts (e.g. CQ 70 + MCQ 30) and a student must pass each part (33%). Leave them empty for a single paper.")}</div>`,
    submit: e ? t("Save") : t("Create exam"),
    footLeft: e ? `<button type="button" class="btn danger" data-action="delete-exam" data-id="${e.id}">${t("Delete exam")}</button>` : "",
    onMount: (f) => {
      // Parts start as the subject's usual split for these full marks.
      const fillParts = (parts) => PART_KEYS.forEach((k) => { f[`part-${k}`].value = parts.find((x) => x.key === k)?.full ?? ""; });
      const suggest = () => fillParts(defaultParts(getClass(f.classId.value)?.subjectRules?.[f.subject.value], f.fullMarks.value));
      if (e) fillParts(e.parts); else suggest();
      f.classId.addEventListener("change", () => { f.subject.innerHTML = subjOpts(getClass(f.classId.value)).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(""); suggest(); });
      f.subject.addEventListener("change", suggest);
      f.fullMarks.addEventListener("change", suggest);
    },
    onSubmit: async (f) => {
      const v = Object.fromEntries(new FormData(f));
      const parts = PART_KEYS.filter((k) => v[`part-${k}`] !== "").map((k) => ({ key: k, full: Number(v[`part-${k}`]) }));
      if (!v.term.trim()) return t("Give the exam a name.");
      const problem = partsProblem(parts, Number(v.fullMarks) || 100);
      if (problem) return t(problem);
      if (!isSchoolDay(v.date)) return t("{day} isn't a school day.", { day: dayName(dateObj(v.date).getDay()) });
      const data = { term: v.term.trim(), classId: v.classId, subject: v.subject, date: v.date, start: v.start, fullMarks: Number(v.fullMarks) || 100, parts };
      await mutate("exam.save", { id: e?.id, ...data });
      toast(e ? t("Exam saved") : t("{subject} exam for {class} on {date}", { subject: subj(data.subject), class: className(data.classId), date: fmtDate(data.date) }));
    },
  });
}
function openHomeworkModal(h) {
  const tid = state.personas.teacher;
  const mine = teachingOf(tid);
  const secs = teacherSections(tid);
  const cur = h ? `${h.classId}|${h.section}` : secs[0] && secs[0].join("|");
  const subjOpts = (key) => { const [c, s] = key.split("|"); return [...new Set(mine.filter((x) => x.classId === c && x.section === s).map((x) => x.subject))].map((x) => [x, subj(x)]); };
  openModal({
    title: h ? t("Edit homework") : t("Add homework"),
    body: `<div class="fields-2">${field(t("Section"), sel("sec", secs.map(([c, s]) => [`${c}|${s}`, classLabel(c, s)]), cur))}${field(t("Subject"), sel("subject", cur ? subjOpts(cur) : [], h?.subject))}</div>
      ${field(t("Topic"), inp("topic", h?.topic, `${ph(t("e.g. Quadratic equations"))} required`))}
      ${field(t("Instructions"), `<textarea class="input textarea" name="details" ${ph(t("What should students do?"))}>${esc(h?.details ?? "")}</textarea>`)}
      ${field(t("Due date"), inp("due", h?.due ?? shiftSchoolDays(today(), 2), `type="date" min="${today()}" required`))}`,
    submit: h ? t("Save") : t("Add homework"),
    footLeft: h ? `<button type="button" class="btn danger" data-action="delete-homework" data-id="${h.id}">${t("Delete")}</button>` : "",
    onMount: (f) => f.sec.addEventListener("change", () => { f.subject.innerHTML = subjOpts(f.sec.value).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(""); }),
    onSubmit: async (f) => {
      const v = Object.fromEntries(new FormData(f));
      if (!secs.length) return t("You don't teach any sections yet.");
      if (!v.topic.trim()) return t("Add a topic.");
      const [classId, section] = v.sec.split("|");
      const data = { classId, section, subject: v.subject, topic: v.topic.trim(), details: v.details.trim(), due: v.due };
      await mutate("homework.save", { id: h?.id, ...data });
      toast(h ? t("Homework saved") : t("Homework set for {class}", { class: classLabel(classId, section) }));
    },
  });
}
// Edit one subject in a period (id), add one alongside (isNew), or fill an
// empty period. Teachers with a class at an overlapping time, in either
// shift, are marked busy.
function openPeriodModal(day, period, id = null, isNew = false) {
  const { cid, sec } = ui._tt; const c = getClass(cid);
  const span = shiftOf(cid, sec).periods[period];
  const here = state.timetable.filter((e) => e.classId === cid && e.section === sec && e.day === day && e.period === period);
  const x = id ? here.find((e) => e.id === id) : null;
  const others = here.filter((e) => e !== x);
  const busy = new Set(state.timetable.filter((e) => e.day === day && !here.includes(e) && spanOf(e) && periodsOverlap(spanOf(e), span)).map((e) => e.teacherId));
  others.filter((e) => !x || canShareSlot(c, e.subject, x.subject)).forEach((e) => busy.add(e.teacherId));
  const choices = isNew ? c.subjects.filter((sub) => others.every((e) => canShareSlot(c, e.subject, sub))) : c.subjects;
  const teacherOpts = (subject) => state.teachers.slice().sort((a, b) => (b.subject === subject) - (a.subject === subject) || a.name.localeCompare(b.name))
    .map((p) => [p.id, `${p.name} · ${subj(p.subject)}${busy.has(p.id) ? ` (${t("busy")})` : ""}`]);
  const subj0 = x?.subject || choices[0];
  const pickTeacher = (sub) => subjectTeacher(cid, sec, sub)?.id || state.teachers.find((p) => p.subject === sub && !busy.has(p.id))?.id;
  const tDefault = x?.teacherId || pickTeacher(subj0);
  const also = others.length ? `<p class="desc-text">${esc(t("Also this period: {list}", { list: others.map((e) => `${subj(e.subject)} (${getTeacher(e.teacherId)?.initials ?? "—"})`).join(", ") }))}</p>` : "";
  openModal({
    title: `${dayName(day)} · ${t("Period {n}", { n: period + 1 })}`,
    body: `<p class="desc-text">${esc(classLabel(cid, sec))} · ${spanText(span)}${multiShift() ? ` · ${esc(shiftName(shiftOf(cid, sec)))}` : ""}</p>${also}
      <div class="fields-2">${field(t("Subject"), sel("subject", choices.map((s) => [s, subj(s)]), subj0))}${field(t("Room"), inp("room", x?.room ?? `${Math.max(1, c.level)}0${sec === "A" ? 1 : 2}${others.length && isNew ? `-${others.length + 1}` : ""}`))}</div>
      ${field(t("Teacher"), sel("teacherId", teacherOpts(subj0), tDefault), t("Teachers marked busy already have a class at this time."))}
      ${!isNew && others.length ? `<div class="hint">${t("Religion classes and 4th subjects can share a period. Any other subject replaces what's there.")}</div>` : ""}`,
    submit: t("Save period"),
    footLeft: x ? `<button type="button" class="btn danger" data-action="clear-period" data-id="${x.id}">${t("Remove from this period")}</button>` : "",
    onMount: (f) => f.subject.addEventListener("change", () => {
      const pick = pickTeacher(f.subject.value);
      f.teacherId.innerHTML = teacherOpts(f.subject.value).map(([v, l]) => `<option value="${v}" ${v === pick ? "selected" : ""}>${esc(l)}</option>`).join("");
    }),
    onSubmit: async (f) => {
      const v = Object.fromEntries(new FormData(f));
      if (busy.has(v.teacherId) && !others.some((e) => e.teacherId === v.teacherId && !canShareSlot(c, e.subject, v.subject))) {
        const other = state.timetable.find((e) => e.day === day && e.teacherId === v.teacherId && e !== x && spanOf(e) && periodsOverlap(spanOf(e), span));
        if (other) return t("{name} is already teaching {class} this period.", { name: getTeacher(v.teacherId).name, class: classLabel(other.classId, other.section) });
      }
      await mutate("timetable.save", { id: x?.id, day, period, classId: cid, section: sec, subject: v.subject, teacherId: v.teacherId, room: v.room });
      toast(t("Timetable updated"));
    },
  });
}

// ======================================================================
// ACTIONS (data-action buttons)
// ======================================================================
const ACTIONS = {
  "add-student": () => openStudentModal(),
  "edit-student": (el) => openStudentModal(getStudent(el.dataset.id)),
  "delete-student": (el) => confirmThen(el, t("Click again to delete"), () => {
    const s = getStudent(el.dataset.id);
    act("student.delete", { id: s.id }, () => { closeModal(); toast(t("{name} removed", { name: s.name })); go("#/students"); });
  }),
  "add-teacher": () => openTeacherModal(),
  "edit-teacher": (el) => openTeacherModal(getTeacher(el.dataset.id)),
  "delete-teacher": (el) => {
    const x = getTeacher(el.dataset.id); const n = state.timetable.filter((p) => p.teacherId === x.id).length;
    if (n) { const er = $("#modalErr"); er.textContent = t("{name} still has {n} periods. Give them to other teachers in the Timetable first.", { name: x.name, n }); er.hidden = false; return; }
    confirmThen(el, t("Click again to delete"), () => act("teacher.delete", { id: x.id }, () => { closeModal(); toast(t("{name} removed", { name: x.name })); }));
  },
  "create-exam": () => openExamModal(),
  "edit-exam": (el) => openExamModal(getExam(el.dataset.id)),
  "delete-exam": (el) => confirmThen(el, t("Click again to delete"), () => act("exam.delete", { id: el.dataset.id }, () => { closeModal(); toast(t("Exam deleted")); })),
  "add-homework": () => openHomeworkModal(),
  "edit-homework": (el) => openHomeworkModal(state.homework.find((h) => h.id === el.dataset.id)),
  "delete-homework": (el) => confirmThen(el, t("Click again to delete"), () => act("homework.delete", { id: el.dataset.id }, () => { closeModal(); toast(t("Homework deleted")); go("#/homework"); })),
  "hw-review": (el) => act("homework.review", { id: el.dataset.id, studentId: el.dataset.sid }),
  "hw-review-all": (el) => act("homework.reviewAll", { id: el.dataset.id }, () => toast(t("All submissions reviewed"))),
  "hw-details": (el) => {
    const h = state.homework.find((x) => x.id === el.dataset.id), s = childOf(), st = hwStatus(h, s.id), x = getTeacher(h.teacherId);
    const canSubmit = state.role === "student" && (st === "pending" || st === "missing");
    const sub = h.submissions[s.id];
    openModal({
      title: esc(h.topic),
      body: `<div style="display:flex;gap:8px;flex-wrap:wrap">${hwPill(st)}<span class="pill plain">${esc(subj(h.subject))}</span><span class="pill plain">${t("Due {date} · {when}", { date: fmtDate(h.due), when: relDay(h.due) })}</span></div>
        <div class="remark"><b>${esc(x?.name ?? t("Teacher"))}</b>${esc(h.details)}</div>
        ${sub ? `<div class="hint">${sub.reviewed ? t("Submitted on {date} · reviewed by the teacher.", { date: fmtDate(sub.on) }) : t("Submitted on {date}.", { date: fmtDate(sub.on) })}</div>` : ""}`,
      submit: canSubmit ? t("Mark as submitted") : null, cancel: t("Close"),
      onSubmit: async () => { await mutate("homework.submit", { id: h.id }); toast(t("Marked as submitted")); },
    });
  },
  "notice": (el) => {
    const n = state.notices.find((x) => x.id === el.dataset.id);
    openModal({
      title: esc(n.topic), cancel: t("Close"),
      body: `<div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill plain">${t("No. {number}", { number: esc(n.number) })}</span><span class="pill plain">${fmtDate(n.date)}</span><span class="pill plain">${esc(L(n.audience))}</span></div><p class="desc-text">${esc(n.body)}</p>`,
      footLeft: state.role === "admin" ? `<button type="button" class="btn danger" data-action="delete-notice" data-id="${n.id}">${t("Delete notice")}</button>` : "",
    });
  },
  "new-notice": () => openModal({
    title: t("Post notice"),
    body: `${field(t("Topic"), inp("topic", "", `${ph(t("e.g. Winter vacation"))} required`))}${field(t("Notice"), `<textarea class="input textarea" name="body" ${ph(t("Write the full notice…"))} required></textarea>`)}${field(t("For"), sel("audience", ["Everyone", "Students", "Guardians", "Teachers"].map((a) => [a, L(a)]), "Everyone"))}
      <label class="check-row" style="cursor:pointer"><div><div class="t">${t("Also send by SMS to guardians")}</div><div class="d">${t("Topic and text, cut to fit a few SMS.")}</div></div><input type="checkbox" class="checkbox" name="sms" /></label>`,
    submit: t("Post notice"),
    onSubmit: async (f) => {
      const v = Object.fromEntries(new FormData(f));
      if (!v.topic.trim() || !v.body.trim()) return t("Add a topic and the notice text.");
      const r = await mutate("notice.create", { ...v, sms: !!f.sms.checked });
      toast(r.sms ? t("Notice posted · {n} SMS to guardians", { n: r.sms }) : t("Notice posted"));
    },
  }),
  "delete-notice": (el) => confirmThen(el, t("Click again to delete"), () => act("notice.delete", { id: el.dataset.id }, () => { closeModal(); toast(t("Notice deleted")); })),
  "attendance-alert": () => {
    const th = state.settings.threshold;
    const low = sortedClasses().map((c) => ({ c, r: classRate(c.id) })).filter((x) => x.r !== null && x.r < th);
    openModal({
      title: t("Attendance alert"),
      body: `<p class="desc-text">${t("These classes are below {th}% over the last 7 school days. Send their guardians a notice and let the class teachers know.", { th })}</p>
        <div class="list">${low.map(({ c, r }) => `<label class="item" style="cursor:pointer"><input type="checkbox" class="checkbox" name="c" value="${c.id}" checked /><span class="item-text"><span class="t">${esc(L(c.name))}</span><span class="m">${t("{n} students · {m} below {th}% this month", { n: sectionStudents(c.id).length, m: sectionStudents(c.id).filter((s) => (studentRate(s.id) ?? 100) < th).length, th })}</span></span><span class="pill red">${r}%</span></label>`).join("")}</div>`,
      submit: t("Send alert"),
      onSubmit: async (f) => {
        const ids = $$('[name="c"]:checked', f).map((i) => i.value);
        if (!ids.length) return t("Pick at least one class.");
        const { names } = await mutate("attendance.alert", { classIds: ids });
        toast(t("Notice sent to guardians of {names}", { names }), { title: t("Alert sent") });
      },
    });
  },
  // Take a payment: tick the dues it's for; paying less leaves the rest due.
  "collect-fee": (el) => {
    const s = getStudent(el.dataset.sid), open = openChargesOf(s.id);
    if (!open.length) { toast(t("Nothing is due for this student.")); return; }
    openModal({
      title: t("Collect payment"), wide: true,
      body: `<p class="desc-text">${esc(s.name)} · ${esc(classLabel(s.classId, s.section))} · ${t("Roll {roll}", { roll: s.roll })}</p>
        <div class="list">${open.map((c) => `<label class="item" style="cursor:pointer"><input type="checkbox" name="charge" value="${c.id}" data-due="${dueOf(c)}" checked style="accent-color:var(--primary);width:18px;height:18px" /><span class="item-text"><span class="t">${esc(chargeLabel(c))}</span><span class="m">${t("Due {date}", { date: fmtDate(c.dueOn) })}${c.paid ? ` · ${t("{amount} paid", { amount: money(c.paid) })}` : ""}</span></span><b class="mono">${money(dueOf(c))}</b></label>`).join("")}</div>
        <div class="fields-3">${field(t("Amount received (৳)"), inp("amount", sum(open.map(dueOf)), 'type="number" min="1" required'), t("Less than the total leaves the rest due."))}${field(t("Paid on"), inp("paidOn", today(), `type="date" max="${today()}"`))}${field(t("Method"), sel("method", ["Cash", "bKash", "Nagad", "Bank transfer"].map((m) => [m, L(m)]), "Cash"))}</div>
        ${field(t("Note"), inp("note", "", ph(t("Optional, e.g. paid by his uncle"))))}`,
      submit: t("Save and print receipt"),
      onMount: (f) => f.addEventListener("change", (e) => { if (e.target.name === "charge") f.amount.value = sum($$('[name="charge"]:checked', f).map((i) => Number(i.dataset.due))); }),
      onSubmit: async (f) => {
        const ids = $$('[name="charge"]:checked', f).map((i) => i.value);
        if (!ids.length) return t("Tick at least one fee.");
        const r = await mutate("fee.collect", { studentId: s.id, chargeIds: ids, amount: Number(f.amount.value), paidOn: f.paidOn.value || today(), method: f.method.value, note: f.note.value });
        toast(t("Receipt {no} saved", { no: r.receiptNo }));
        setTimeout(() => go(`#/receipt/${r.paymentId}`));
      },
    });
  },
  // Charge a fee to everyone, a class, a section, or one student.
  "charge-fee": (el) => {
    const one = el.dataset.sid ? getStudent(el.dataset.sid) : null;
    const nameFor = (k) => (k === "session" ? `Session fee ${state.settings.year}` : KIND_LABEL[k]);
    openModal({
      title: t("Add a fee"),
      body: `${one ? `<p class="desc-text">${esc(one.name)} · ${esc(classLabel(one.classId, one.section))}</p>` : ""}
        <div class="fields-2">${field(t("Kind"), sel("kind", FEE_KINDS.map((k) => [k, t(KIND_LABEL[k])]), "exam"))}${field(t("Name"), inp("label", nameFor("exam"), "required"), t("As it will show on receipts."))}</div>
        <div class="fields-2">${field(t("Amount (৳)"), inp("amount", "", 'type="number" min="1" required'))}${field(t("Due date"), inp("dueOn", shiftSchoolDays(today(), 10), 'type="date" required'))}</div>
        ${one ? "" : `<div class="fields-2">${field(t("Charge to"), sel("classId", [["", t("Every student")], ...sortedClasses().map((c) => [c.id, L(c.name)])], ""))}${field(t("Section"), sel("section", [["", t("All sections")]], ""))}</div>`}`,
      submit: t("Add fee"),
      onMount: (f) => {
        f.kind.addEventListener("change", () => { f.label.value = nameFor(f.kind.value); });
        f.classId?.addEventListener("change", () => { const c = getClass(f.classId.value); f.section.innerHTML = [["", t("All sections")], ...(c?.sections ?? []).map((x) => [x, x])].map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(""); });
      },
      onSubmit: async (f) => {
        const v = Object.fromEntries(new FormData(f));
        if (!v.label.trim() || !(Number(v.amount) > 0)) return t("Name the fee and enter the amount.");
        const r = await mutate("fee.charge", { kind: v.kind, label: v.label.trim(), amount: Number(v.amount), dueOn: v.dueOn, studentId: one?.id, classId: v.classId || null, section: v.section || null });
        toast(t("{label} added for {n} students", { label: v.label.trim(), n: r.count }));
      },
    });
  },
  "discount-charge": (el) => {
    const c = getCharge(el.dataset.id);
    openModal({
      title: t("Discount"),
      body: `<p class="desc-text">${esc(chargeLabel(c))} · ${money(c.amount)}${c.paid ? ` · ${t("{amount} paid", { amount: money(c.paid) })}` : ""}</p>${field(t("Discount (৳)"), inp("discount", c.discount, `type="number" min="0" max="${c.amount - c.paid}" required`), t("For example a waiver for a poor student or a sibling."))}`,
      submit: t("Save"),
      onSubmit: async (f) => { await mutate("fee.discount", { chargeId: c.id, discount: Number(f.discount.value) }); toast(t("Discount saved")); },
    });
  },
  "delete-charge": (el) => confirmThen(el, t("Click again to remove"), () => act("fee.chargeDelete", { id: el.dataset.id }, () => toast(t("Fee removed")))),
  "void-receipt": (el) => confirmThen(el, t("Click again: the amount is due again"), () => act("fee.void", { paymentId: el.dataset.id }, () => toast(t("Receipt cancelled")))),
  "pay-fee": () => {
    const s = childOf(), owe = studentDue(s.id);
    openModal({
      title: t("Pay fees"),
      body: `<div class="stat" style="background:var(--surface-2)"><div class="n">${money(owe)}</div><div class="l">${esc(openChargesOf(s.id).map(chargeLabel).join(", "))}</div></div>${field(t("Pay with"), sel("method", ["bKash", "Nagad", "Card", "Bank transfer"].map((m) => [m, L(m)]), "bKash"), t("Demo only: no money moves. The payment is recorded straight away."))}`,
      submit: t("Pay {amount}", { amount: money(owe) }),
      onSubmit: async (f) => { const r = await mutate("fee.pay", { method: f.method.value }); toast(t("Paid · receipt {no}", { no: r.receiptNo }), { title: t("Payment received") }); setTimeout(() => go(`#/receipt/${r.paymentId}`)); },
    });
  },
  "send-reminders": () => act("fees.remind", {}, ({ sent, owing }) => toast(t("{n} SMS reminders for {m} students with dues", { n: sent, m: owing }), { title: t("Fee reminders") })),
  "enquiry-handle": (el) => act("enquiry.handle", { id: el.dataset.id }),
  "enquiry-delete": (el) => confirmThen(el, t("Click again to remove"), () => act("enquiry.delete", { id: el.dataset.id }, () => toast(t("Enquiry removed")))),
  "promo-toggle": (el) => { const sid = el.dataset.sid; ui.promo[sid] = { ...(ui.promo[sid] || {}), promote: el.checked }; route(); },
  "run-promotion": (el) => confirmThen(el, t("Click again to promote everyone"), () => {
    const choices = Object.fromEntries(state.students.map((s) => [s.id, { promote: ui.promo[s.id]?.promote ?? studentResult(s.id, el.dataset.term).passed, section: ui.promo[s.id]?.section }]));
    act("promotion.run", { term: el.dataset.term, choices }, (r) => { ui.promo = {}; toast(t("{p} promoted, {s} repeat, {o} passed out. The academic year is now {year}.", { p: r.promoted, s: r.repeating, o: r.passedOut, year: r.year }), { title: t("Promotion done") }); go("#/dashboard"); });
  }),
  "publish-term": (el) => act("results.publish", { term: el.dataset.term, on: el.checked }, () => toast(el.checked ? t("{term} published", { term: term(el.dataset.term) }) : t("{term} hidden from students and parents", { term: term(el.dataset.term) }))),
  "edit-period": (el) => openPeriodModal(Number(el.dataset.day), Number(el.dataset.period), el.dataset.id || null, !!el.dataset.new),
  "clear-period": (el) => act("timetable.clear", { id: el.dataset.id }, () => { closeModal(); toast(t("Period cleared")); }),
  "att-mark": (el) => { ui.attDraft.marks[el.dataset.sid] = el.dataset.v; route(); },
  "att-all-present": () => { Object.keys(ui.attDraft.marks).forEach((k) => { ui.attDraft.marks[k] = "P"; }); const [, cid, sec] = ui.attDraft.key.split("|"); sectionStudents(cid, sec).forEach((s) => { ui.attDraft.marks[s.id] = "P"; }); route(); },
  "att-save": (el) => {
    const [date, cid, sec] = el.dataset.key.split("|");
    const marks = {}; sectionStudents(cid, sec).forEach((s) => { marks[s.id] = ui.attDraft.marks[s.id] || "P"; });
    el.disabled = true;
    act("attendance.save", { date, classId: cid, section: sec, marks }, (r) => toast(`${t("{class}: {p} present, {a} absent", { class: classLabel(cid, sec), p: r.present, a: r.absent })}${r.sms ? ` · ${t("{n} SMS to guardians", { n: r.sms })}` : ""}`, { title: t("Attendance saved") }));
  },
  "toggle-feature": (el) => act("features.update", { key: el.dataset.key, on: el.checked }, () => toast(t(el.checked ? "{feature} turned on" : "{feature} turned off", { feature: t(FEATURES[el.dataset.key].label) }))),
  "class-preview": () => {
    const v = readClassForm($("#classForm"));
    const none = `<span class="muted">${t("None")}</span>`;
    openModal({
      title: v.short ? `${esc(L(`Class ${v.short}`))} · ${esc(v.year)}` : t("Preview"), cancel: t("Close"),
      body: `<dl class="kv"><dt>${t("Class")}</dt><dd>${v.short ? esc(L(`Class ${v.short}`)) : `<span class="muted">${t("Not picked")}</span>`}</dd><dt>${t("Academic year")}</dt><dd>${esc(v.year)}</dd><dt>${t("Sections")}</dt><dd>${v.sections.map((s) => `<span class="pill plain" style="margin:0 4px 4px 0">${esc(s)}</span>`).join("") || none}</dd><dt>${t("Subjects")}</dt><dd>${v.subjects.map((s) => `<span class="pill violet plain" style="margin:0 4px 4px 0">${esc(subj(s))}</span>`).join("") || none}</dd><dt>${t("Monthly fee")}</dt><dd>${money(v.fee)}</dd></dl>`,
    });
  },
  "grade-preview": () => {
    const ranges = readGrades($("#gradeForm")).sort((a, b) => b.start - a.start);
    const p = gradeProblem(ranges), gaps = p ? [] : gradeGaps(ranges);
    openModal({
      title: t("Grading preview"), cancel: t("Close"),
      body: `${p ? `<div class="err" style="margin:0">${esc(p)}</div>` : ""}${table([t("Marks (%)"), t("Grade"), [t("Point"), "r"]], ranges.map((r) => `<tr><td class="mono">${r.start} – ${r.end}</td><td>${gradeTag(r.grade)}</td><td class="r mono">${r.point === "" ? "—" : Number(r.point).toFixed(2)}</td></tr>`))}${gaps.length ? `<div class="hint">${t("Not covered: {gaps}.", { gaps: gaps.join(", ") })}</div>` : ""}`,
    });
  },
  "add-grade": () => { $("#gradeRows").insertAdjacentHTML("beforeend", gradeRow()); $("#gradeRows .grade-row:last-child input").focus(); },
  "add-row": (el) => { const box = el.dataset.kind === "section" ? $("#secRows") : $("#subRows"); box.insertAdjacentHTML("beforeend", rowInput(el.dataset.kind, "", el.dataset.kind === "section" ? t("Section name") : t("Add subject"))); box.lastElementChild.querySelector("input").focus(); },
  "remove-row": (el) => { const row = el.closest(".row-input, .grade-row"); const box = row.parentElement; if (box.children.length > 1) row.remove(); else row.querySelectorAll("input").forEach((i) => { i.value = ""; }); },
  "delete-class": (el) => {
    const c = getClass(el.dataset.id);
    if (sectionStudents(c.id).length) { const er = $("#classErr"); er.textContent = t("{name} still has {n} students. Move or remove them first.", { name: L(c.name), n: sectionStudents(c.id).length }); er.hidden = false; return; }
    confirmThen(el, t("Click again to delete"), () => act("class.delete", { id: c.id }, () => { toast(t("{name} deleted", { name: L(c.name) })); go("#/classes"); }));
  },
  "scroll-to": (el) => $(`#${el.dataset.target}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
  "print": () => window.print(),
  "theme": (el) => setThemePref(el.dataset.pref),
  "palette": (el) => setPalette(el.dataset.pal),
  "language": (el) => setLanguage(el.dataset.lang),
  "reset-data": (el) => confirmThen(el, t("Click again to reset everything"), () => act("demo.reset", {}, () => { Object.keys(ui).forEach((k) => delete ui[k]); toast(t("Demo data reset")); go("#/dashboard"); })),
  "reset-access": (el) => {
    const key = el.dataset.key, wasActive = !!state.accounts?.[key]?.active;
    const run = () => act("account.reset", { key }, (r) => setTimeout(() => showCodes(t("New activation code"), [r],
      wasActive ? t("Their old password no longer works and they've been signed out.") : t("Any earlier code for this account no longer works."))));
    if (wasActive) confirmThen(el, t("Click again: signs them out"), run); else run();
  },
  "copy-codes": async (el) => {
    try { await navigator.clipboard.writeText(ui.codesText || ""); el.textContent = t("Copied"); } catch { toast(t("Couldn't copy. Select the codes and copy them by hand.")); }
  },
  "logout": async () => {
    await flushPrefs();
    try { await api("/api/auth/logout", {}); } catch {}
    location.href = "/login";
  },
};
// Destructive buttons need a second click.
function confirmThen(el, label, fn) {
  if (el.dataset.armed) return fn();
  el.dataset.armed = "1"; const old = el.innerHTML; el.textContent = label; el.classList.add("confirm");
  setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.innerHTML = old; el.classList.remove("confirm"); } }, 3000);
}

// ======================================================================
// EVENTS (bound when the module first loads, after the shell is mounted)
// ======================================================================
document.addEventListener("click", (e) => {
  const group = e.target.closest("[data-group]");
  if (group) { const g = group.dataset.group; const sub = group.nextElementSibling; const open = sub.hidden; sub.hidden = !open; group.setAttribute("aria-expanded", String(open)); state.navOpen[g] = open; savePrefs(); return; }

  const uiSet = e.target.closest("[data-ui-set]");
  if (uiSet) { ui[uiSet.dataset.uiSet] = uiSet.dataset.val; route(); return; }

  const act = e.target.closest("[data-action]");
  if (act && ACTIONS[act.dataset.action]) {
    if (act.matches('input[type="checkbox"]')) { ACTIONS[act.dataset.action](act, e); return; }
    e.preventDefault(); e.stopPropagation(); ACTIONS[act.dataset.action](act, e); return;
  }
  const row = e.target.closest("tr[data-href]");
  if (row && !e.target.closest("a, button")) { go(row.dataset.href); return; }
});
document.addEventListener("change", (e) => {
  const ps = e.target.closest("select[data-promo-sec]");
  if (ps) { const sid = ps.dataset.promoSec; ui.promo[sid] = { ...(ui.promo[sid] || {}), promote: true, section: ps.value }; route(); return; }
  const s = e.target.closest("select[data-ui]");
  if (s) {
    if (s.dataset.ui === "attSection") { const [c, sec] = s.value.split("|"); const date = $("[data-att-date]")?.value; ui.attDraft = null; go(`#/attendance/${c}/${sec}${date ? `/${date}` : ""}`); return; }
    ui[s.dataset.ui] = s.value;
    if (s.dataset.ui === "ttClass") delete ui.ttSec;
    if (s.dataset.ui === "prTerm") ui.promo = {};
    if (s.dataset.ui === "rsClass") delete ui.rsSec;
    route(); return;
  }
  if (e.target.matches("[data-att-date]")) {
    const [, , sec] = ui.attDraft?.key.split("|") || [];
    const cid = ui.attDraft?.key.split("|")[1];
    ui.attDraft = null; go(`#/attendance/${cid}/${sec}/${e.target.value}`);
  }
});
// Live search: filters rows (or list items) inside the target container.
document.addEventListener("input", (e) => {
  // Bangla digits typed into a search box match the same numbers.
  const q = e.target.dataset?.search !== undefined ? toLatinDigits(e.target.value.trim().toLowerCase()) : null;
  if (q === null) return;
  const box = document.getElementById(e.target.dataset.search); if (!box) return;
  box.querySelectorAll("[data-s]").forEach((el) => { el.hidden = !!q && !el.dataset.s.includes(q); el.style.display = el.hidden ? "none" : ""; });
});
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); $(".popover")?.remove(); document.body.classList.remove("nav-open"); } });

// Profile menu
const meMenu = $("#meMenu"), meTrigger = $("#meTrigger");
meTrigger.addEventListener("click", (e) => { e.stopPropagation(); meMenu.hidden = !meMenu.hidden; meTrigger.setAttribute("aria-expanded", String(!meMenu.hidden)); });
document.addEventListener("click", (e) => { if (!e.target.closest("#me")) { meMenu.hidden = true; meTrigger.setAttribute("aria-expanded", "false"); } });

// Mobile menu
$("#menuBtn").addEventListener("click", () => document.body.classList.add("nav-open"));
$("#scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));

// Language switch in the sidebar
$("#langToggle")?.addEventListener("click", () => setLanguage(t.lang === "bn" ? "en" : "bn"));

// Bell
$("#bell").addEventListener("click", (e) => {
  e.stopPropagation();
  const existing = $(".popover"); if (existing) { existing.remove(); return; }
  const list = notifications();
  const p = document.createElement("div"); p.className = "popover";
  const draw = () => {
    p.innerHTML = `<div class="notif-head"><b>${t("Notifications")}</b>${list.some((n) => !state.readNotifs.includes(n.id)) ? `<button class="btn sm ghost" data-mark-all>${t("Mark all read")}</button>` : ""}</div>
      <div class="notif-list">${list.length ? list.map((n) => `<a class="notif" href="${n.href}" data-nid="${esc(n.id)}"><span class="item-tile">${icon(n.ic, "")}</span><span class="notif-text"><span>${n.html}</span><span class="notif-meta">${n.meta}</span></span>${state.readNotifs.includes(n.id) ? "" : `<span class="notif-dot"></span>`}</a>`).join("") : `<div class="notif-empty">${t("You're all caught up.")}</div>`}</div>`;
  };
  draw();
  p.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (ev.target.closest("[data-mark-all]")) { list.forEach((n) => { if (!state.readNotifs.includes(n.id)) state.readNotifs.push(n.id); }); savePrefs(); draw(); updateBell(); return; }
    const a = ev.target.closest("[data-nid]");
    if (a) { if (!state.readNotifs.includes(a.dataset.nid)) state.readNotifs.push(a.dataset.nid); savePrefs(); p.remove(); if (location.hash === a.getAttribute("href")) { ev.preventDefault(); route(); } }
  });
  document.body.appendChild(p);
});
document.addEventListener("click", (e) => { if (!e.target.closest(".popover, #bell")) $(".popover")?.remove(); });

// ---------- toasts ----------
function toast(text, { title } = {}) {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const el = document.createElement("div"); el.className = "toast";
  el.innerHTML = `${title ? `<b>${esc(title)}</b>` : ""}<span>${esc(text)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, 3500);
}

// ---------- theme ----------
const THEME_KEY = "edulytics-theme";
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
function themePref() { try { return localStorage.getItem(THEME_KEY) || "system"; } catch { return "system"; } }
function applyTheme(pref = themePref()) {
  const dark = pref === "dark" || (pref === "system" && darkQuery.matches);
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.dataset.theme = dark ? "dark" : "light";
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}
function setThemePref(pref) { try { localStorage.setItem(THEME_KEY, pref); } catch {} applyTheme(pref); if (parseHash()[0] === "settings") route(); }
darkQuery.addEventListener("change", () => { if (themePref() === "system") applyTheme(); });

// ---------- colour themes ----------
// "original" is the role's own look (classic for staff, friendly for students).
// Swatches: sidebar, background, primary, accent.
const palettes = () => ({
  original: state.role === "student"
    ? { label: "Original", desc: "Navy, violet and pink", swatch: ["#12263f", "#edf0f8", "#7c6cf2", "#f8b4d0"] }
    : { label: "Original", desc: "Charcoal, stone and gold", swatch: ["#2b2a27", "#ebe8e1", "#fbfaf6", "#b08d3c"] },
  blue: { label: "Blue", desc: "Rich royal blue", swatch: ["#ffffff", "#e8ebf2", "#1f3fcf", "#2f5bff"] },
  green: { label: "Green", desc: "Forest green and lime", swatch: ["#ffffff", "#ececea", "#1f4a16", "#b6eb72"] },
  purple: { label: "Purple", desc: "Soft lavender", swatch: ["#ffffff", "#eef0f8", "#7356e0", "#9b7bf7"] },
  neutral: { label: "Neutral", desc: "Black, white and grays", swatch: ["#ffffff", "#ebebea", "#1a1a1a", "#9b9b97"] },
});
const PALETTE_KEY = "edulytics-palette";
function palettePref() { try { const p = localStorage.getItem(PALETTE_KEY); return palettes()[p] ? p : "original"; } catch { return "original"; } }
function setPalette(p) {
  try { localStorage.setItem(PALETTE_KEY, p); } catch {}
  const root = document.documentElement;
  root.classList.add("theme-switching");
  if (p === "original") delete root.dataset.palette; else root.dataset.palette = p;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  if (parseHash()[0] === "settings") route();
}

$("#themeToggle").addEventListener("click", () => setThemePref(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

// ---------- start ----------
let started = false;
export function start(initial) {
  if (started) return;
  started = true;
  state = initial;
  loadedAt = Date.now();
  useLanguage(initial.lang);
  window.addEventListener("hashchange", route);
  // Back on the tab after a while: pick up what others changed meanwhile
  // (but never redraw over a form that's being filled in).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || Date.now() - loadedAt < 60000) return;
    if (!$("#modal").hidden || $("#view form")) return;
    reload().then(route, () => {});
  });
  if (!location.hash) history.replaceState(null, "", "#/dashboard");
  route();
}

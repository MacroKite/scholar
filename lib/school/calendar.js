// Scholar — class names, subjects and date helpers. Shared by the browser
// and the server. The school week and periods are set by each school
// (lib/school/rules.js); SCHOOL_DAYS is only the default.

export const SCHOOL_DAYS = [0, 1, 2, 3, 4]; // Sunday–Thursday
export const CLASS_WORDS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
// Every class a school can set up; a class's level is its index here minus 2 (Play = -2, One = 1).
export const CLASS_NAMES = ["Play", "Nursery", "KG", ...CLASS_WORDS, "Eleven", "Twelve"];
export const PAYMENT_METHODS = ["Cash", "bKash", "Nagad", "Card", "Bank transfer"];
export const AUDIENCES = ["Everyone", "Students", "Guardians", "Teachers"];
export const JUNIOR = ["Bangla", "English", "Mathematics", "General Science", "Social Science", "Religion", "ICT"];
// Classes 9–10: every SSC subject; lib/school/rules.js says who takes which.
export const SENIOR = ["Bangla", "English", "Mathematics", "ICT", "Islam Studies", "Hindu Religion", "Buddhist Religion", "Christian Religion",
  "Physics", "Chemistry", "Biology", "Bangladesh & Global Studies", "General Science", "Accounting", "Finance & Banking", "Business Entrepreneurship",
  "History", "Geography", "Civics", "Higher Math", "Agriculture Studies"];

export const DEFAULT_GRADING = {
  scale: "gpa5",
  ranges: [
    { start: 80, end: 100, grade: "A+", point: 5 },
    { start: 70, end: 79, grade: "A", point: 4 },
    { start: 60, end: 69, grade: "A-", point: 3.5 },
    { start: 50, end: 59, grade: "B", point: 3 },
    { start: 40, end: 49, grade: "C", point: 2 },
    { start: 33, end: 39, grade: "D", point: 1 },
    { start: 0, end: 32, grade: "F", point: 0 },
  ],
};

export function isoOf(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
export function addDays(isoStr, n) { const d = new Date(isoStr + "T00:00:00"); d.setDate(d.getDate() + n); return isoOf(d); }
export function isSchoolDay(isoStr, days = SCHOOL_DAYS) { return days.includes(new Date(isoStr + "T00:00:00").getDay()); }
// The n-th school day before (n < 0) or after (n > 0) a date.
export function shiftSchoolDays(isoStr, n, days = SCHOOL_DAYS) {
  let d = isoStr, step = n < 0 ? -1 : 1, left = Math.abs(n);
  if (n === 0) { while (!isSchoolDay(d, days)) d = addDays(d, 1); return d; }
  while (left > 0) { d = addDays(d, step); if (isSchoolDay(d, days)) left--; }
  return d;
}
export const isIsoDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00"));

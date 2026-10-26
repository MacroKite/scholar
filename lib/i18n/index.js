// Scholar — English and Bangla (বাংলা).
// The app writes its text in English and looks it up here: the English text
// is the key, and anything without a Bangla entry is shown in English. Used
// by the browser app, the sign-in pages and the server's error messages.
// In Bangla, numbers are shown in Bangla digits (t.digits) and grades in
// Bangla letters (t.grade). What people type back (usernames, codes, IDs,
// phone numbers) stays in Latin digits; the browser app marks those.

import { BN } from "./bn.js";

export const LANG_COOKIE = "scholar_lang";
export const LANG_LABELS = { en: "English", bn: "বাংলা" };
export const langOf = (v) => (v === "bn" ? "bn" : "en");

// English plurals. Bangla nouns don't change with the count, so its entries
// are plain strings.
const s = (n) => (n === 1 ? "" : "s");
const EN = {
  "{n} students": ({ n }) => `${n} student${s(n)}`,
  "{n} students.": ({ n }) => `${n} student${s(n)}.`,
  "{n} students in your sections.": ({ n }) => `${n} student${s(n)} in your sections.`,
  "{n} sections": ({ n }) => `${n} section${s(n)}`,
  "/ {n} sections": ({ n }) => `/ ${n} section${s(n)}`,
  "{n} classes · {m} sections": ({ n, m }) => `${n} class${n === 1 ? "" : "es"} · ${m} section${s(m)}`,
  "{n} subjects pending": ({ n }) => `${n} subject${s(n)} pending`,
  "{n} sections have no class teacher": ({ n }) => `${n} section${s(n)} ${n === 1 ? "has" : "have"} no class teacher`,
  "{n} sections have no class teacher: {list}": ({ n, list }) => `${n} section${s(n)} ${n === 1 ? "has" : "have"} no class teacher: ${list}`,
  "Review {n} submissions · {topic}": ({ n, topic }) => `Review ${n} submission${s(n)} · ${topic}`,
  "Reminder sent to {n} guardians": ({ n }) => `Reminder sent to ${n} guardian${s(n)}`,
  "Outstanding · {n} months": ({ n }) => `Outstanding · ${n} month${s(n)}`,
  "{name} added with {n} sections": ({ name, n }) => `${name} added with ${n} section${s(n)}`,
  "{list} are below the {th}% attendance threshold over the last 7 school days.": ({ list, count, th }) =>
    `${list} ${count === 1 ? "is" : "are"} below the ${th}% attendance threshold over the last 7 school days.`,
  "{n} teachers across {m} subjects.": ({ n, m }) => `${n} teacher${s(n)} across ${m} subject${s(m)}.`,
  // Roll-call buttons: one letter each.
  "mark:P": "P",
  "mark:A": "A",
  "mark:L": "L",
};

const fill = (text, p) => (p ? text.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : text);

export function translate(lang, key, params) {
  const v = (lang === "bn" ? BN[key] : undefined) ?? EN[key] ?? key;
  return typeof v === "function" ? v(params || {}) : fill(v, params);
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toBnDigits = (s) => String(s).replace(/[0-9]/g, (d) => BN_DIGITS[d]);
export const toLatinDigits = (s) => String(s).replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
// The usual letter grades; a school's own grade names are shown as entered.
const BN_GRADES = { "A+": "এ+", A: "এ", "A-": "এ-", B: "বি", C: "সি", D: "ডি", F: "এফ" };
// Time of day for clock times: সকাল ৮:০০, দুপুর ১২:৫০.
const bnDayPart = (h) => (h < 4 ? "রাত" : h < 6 ? "ভোর" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকাল" : h < 20 ? "সন্ধ্যা" : "রাত");

const BN_ORDINAL ={ 1: "ম", 2: "য়", 3: "য়", 4: "র্থ", 5: "ম", 6: "ষ্ঠ", 7: "ম", 8: "ম", 9: "ম", 10: "ম" };

// t(key, params) plus helpers for the current language.
export function makeT(lang) {
  lang = langOf(lang);
  const t = (key, params) => translate(lang, key, params);
  t.lang = lang;
  // Dates in Bangla month and day names, with Latin digits.
  t.locale = lang === "bn" ? "bn-BD-u-nu-latn" : "en-GB";
  // Words that come from the school's data (subjects, class names,
  // audiences…): translated when the dictionary knows them, else as entered.
  t.data = (text) => (lang === "bn" && typeof BN[text] === "string" ? BN[text] : text);
  // Exam names: the usual ones are translated, anything else is kept.
  t.term = (name) => {
    if (lang !== "bn" || !name) return name;
    if (typeof BN[name] === "string") return BN[name];
    let m = name.match(/^Class Test (\d+)$/);
    if (m) return `ক্লাস টেস্ট ${m[1]}`;
    m = name.match(/^Monthly Test — (\w+)$/);
    if (m) return `মাসিক পরীক্ষা — ${BN[m[1]] ?? m[1]}`;
    return name;
  };
  t.digits = (s) => (lang === "bn" ? toBnDigits(s) : String(s));
  t.grade = (g) => (lang === "bn" && BN_GRADES[g] ? BN_GRADES[g] : g);
  // "08:45" → "8:45 AM", or in Bangla "সকাল 8:45" (digits are converted on screen).
  t.time = (hhmm) => {
    const [h, m] = String(hhmm).split(":").map(Number);
    const clock = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
    return lang === "bn" ? `${bnDayPart(h)} ${clock}` : `${clock} ${h < 12 ? "AM" : "PM"}`;
  };
  t.ordinal = (n) => {
    if (lang === "bn") return `${n}${BN_ORDINAL[n] ?? "তম"}`;
    const sfx = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]);
  };
  return t;
}

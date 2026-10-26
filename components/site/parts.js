// Scholar — pieces shared by the website's pages (server components).

import { makeT } from "@/lib/i18n/index.js";
import { currentLang } from "@/lib/server/session.js";
import { siteData } from "@/lib/server/site.js";
import { photosOf } from "./photos.js";

// The page's language, its t(), and the school's public data.
export async function sitePage() {
  const lang = await currentLang();
  const t = makeT(lang);
  const data = await siteData();
  // Dates in the page's language; Bangla dates use Bangla digits.
  const date = (iso, opts = { day: "numeric", month: "long", year: "numeric" }) => new Date(iso + "T00:00:00").toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", opts);
  const num = (n) => t.digits(String(n));
  const time = (hhmm) => t.digits(t.time(hhmm));
  return { lang, t, data, date, num, time };
}

// The banner at the top of the inner pages: a school photo under green,
// with a trail back home.
export async function PageHead({ eyebrow, title, children }) {
  const { t, data } = await sitePage();
  const photo = data ? photosOf(data.website).banner : null;
  return (
    <section className="site-pagehead" style={photo ? { "--banner": `url("${photo.replace(/["\\\s]/g, encodeURIComponent)}")` } : undefined}>
      <div className="site-wrap">
        <div className="site-crumbs"><a href="/">{t("Home")}</a>{eyebrow && <><span>/</span>{eyebrow}</>}</div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
    </section>
  );
}

// The school's crest: a shield with the first letter of its name.
export function Crest({ school, size = 52 }) {
  return (
    <svg className="site-crest" width={size} height={size * 1.1} viewBox="0 0 48 53" aria-hidden="true">
      <path d="M24 2 44 8v16c0 13-9 22-20 27C13 46 4 37 4 24V8z" fill="var(--g-800)" stroke="var(--gold)" strokeWidth="2.5" />
      <path d="M24 7 39 11.5V24c0 10-7 17-15 21-8-4-15-11-15-21V11.5z" fill="none" stroke="var(--gold)" strokeWidth=".8" opacity=".6" />
      <text x="24" y="31" textAnchor="middle" fill="var(--gold)" fontFamily="var(--display)" fontWeight="700" fontSize="20">{school.slice(0, 1)}</text>
    </svg>
  );
}

const PATHS = {
  check: "M20 6 9 17l-5-5",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  pin: "M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  arrow: "M5 12h14M13 6l6 6-6 6",
  cap: "m2 9 10-5 10 5-10 5zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5",
  users: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  award: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14 7 21l5-3 5 3-1.5-7",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 8a5 5 0 0 1 0 8",
  facebook: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",
  left: "m15 18-6-6 6-6",
  right: "m9 18 6-6-6-6",
  calendar: "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18",
  flask: "M9 3h6M10 3v6l-5.6 9.5A2 2 0 0 0 6.1 21.5h11.8a2 2 0 0 0 1.7-3L14 9V3M7 15h10",
  monitor: "M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 20h8M12 16v4",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z",
  bus: "M7 3h10a2 2 0 0 1 2 2v12H5V5a2 2 0 0 1 2-2zM5 11h14M8 20v-3M16 20v-3M8 14h.01M16 14h.01",
  home: "M3 11 12 3l9 8M5 9.5V21h14V9.5M10 21v-6h4v6",
  ball: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7l4 3-1.5 5h-5L8 10z",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z",
};
// An icon that suits a facility the admin typed in (English or Bangla).
const FACILITY_ICONS = [
  [/computer|ict|internet|কম্পিউটার|আইসিটি/i, "monitor"], [/lab|science|বিজ্ঞান|ল্যাব|গবেষণা/i, "flask"],
  [/librar|book|লাইব্রেরি|গ্রন্থাগার|বই/i, "book"], [/cctv|guard|secur|নিরাপত্তা|সিসি/i, "shield"],
  [/aid|doctor|medic|health|চিকিৎসা|ডাক্তার/i, "heart"], [/bus|transport|পরিবহন|বাস/i, "bus"],
  [/play|game|sport|field|খেলা|মাঠ/i, "ball"], [/prayer|mosque|নামাজ|মসজিদ/i, "moon"], [/common room|কমন রুম/i, "home"],
];
export const facilityIcon = (text) => FACILITY_ICONS.find(([re]) => re.test(text))?.[1] ?? "check";
export const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>
);

// A school building with a flag and trees, in the doodle style.
export function SchoolArt() {
  return (
    <svg className="ill site-art" viewBox="0 0 320 220" aria-hidden="true">
      <path d="M20 196H300" />
      <path className="w" d="M60 196V104l100-52 100 52v92z" />
      <path className="f" d="M44 108 160 46l116 62" />
      <rect className="f" x="134" y="146" width="52" height="50" rx="3" />
      <path d="M160 146v50" />
      <circle className="w" cx="160" cy="98" r="18" /><path d="M160 88v10l7 5" />
      {[80, 104, 196, 220].map((x) => <rect key={x} className="w" x={x} y="128" width="18" height="22" rx="2" />)}
      {[80, 104, 196, 220].map((x) => <rect key={`b${x}`} className="w" x={x} y="160" width="18" height="22" rx="2" />)}
      <path d="M160 46V14" /><path className="f" d="M160 14h30l-8 8 8 8h-30z" />
      <path className="f" d="M290 196v-26" /><circle className="f" cx="290" cy="150" r="22" /><circle className="w" cx="298" cy="160" r="12" />
      <path d="M30 196v-20" /><circle className="w" cx="30" cy="160" r="18" /><circle className="f" cx="22" cy="168" r="10" />
      <path className="f" stroke="none" d="M248 30l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z" />
      <path className="f" stroke="none" d="M66 40l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
    </svg>
  );
}

// A named officer (information officer, appeal authority, GRS or NIS focal
// point) with their post and how to reach them.
export function Officer({ title, o }) {
  return (
    <div className="site-card site-officer">
      <div className="site-eyebrow">{title}</div>
      <b>{o.name}</b>
      {o.post && <span>{o.post}</span>}
      {o.phone && <a href={`tel:${o.phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={15} />{o.phone}</a>}
      {o.email && <a href={`mailto:${o.email}`}><Icon name="mail" size={15} />{o.email}</a>}
    </div>
  );
}

// SSC results by year (Home and About).
export function ResultsTable({ results, t, num }) {
  return (
    <div className="site-card site-table">
      <table className="tbl">
        <thead><tr><th>{t("Year")}</th><th className="num">{t("Examinees")}</th><th className="num">{t("Passed")}</th><th className="num">{t("Pass rate")}</th><th className="num">{t("GPA 5")}</th></tr></thead>
        <tbody>{results.map((r) => <tr key={r.year}><td className="strong">{num(r.year)}</td><td className="num">{num(r.examinees)}</td><td className="num">{num(r.passed)}</td><td className="num">{num(Math.round((r.passed / r.examinees) * 100))}%</td><td className="num">{num(r.gpa5)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

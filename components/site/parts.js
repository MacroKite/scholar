// Scholar — pieces shared by the website's pages (server components).

import { makeT } from "@/lib/i18n/index.js";
import { currentLang } from "@/lib/server/session.js";
import { siteData } from "@/lib/server/site.js";

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

export function PageHead({ eyebrow, title, children }) {
  return (
    <section className="site-pagehead">
      <div className="site-wrap">
        {eyebrow && <div className="site-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
    </section>
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
};
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

import { sitePage, PageHead } from "@/components/site/parts.js";
import { calendarOf } from "@/lib/school/website.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("Academic calendar")} · ${data?.school ?? "Scholar"}` };
}

// Holidays and events the admin lists, by month, with the exams Scholar
// already knows about.
export default async function Calendar() {
  const { t, data, date } = await sitePage();
  if (!data) return null;
  const events = calendarOf(data.website);
  // Each exam's first day, from the exam routine.
  const exams = Object.values(data.exams.reduce((m, e) => { m[e.term] ??= e; return m; }, {}))
    .map((e) => ({ from: e.date, to: "", event: t("{term} starts", { term: t.term(e.term) }), exam: true }));
  const all = [...events, ...exams].sort((a, b) => a.from.localeCompare(b.from));
  const byMonth = {};
  all.forEach((e) => { (byMonth[e.from.slice(0, 7)] ||= []).push(e); });
  return (
    <>
      <PageHead eyebrow={t("Academics")} title={t("Academic calendar")}>{t("Holidays, events and exams through the year.")}</PageHead>
      <div className="site-wrap site-body">
        {all.length === 0 ? <p className="site-note site-section">{t("The calendar will be published soon.")}</p> : Object.entries(byMonth).map(([ym, list]) => (
          <section key={ym} className="site-section">
            <h2>{date(`${ym}-01`, { month: "long", year: "numeric" })}</h2>
            <div className="site-notice-full">
              {list.map((e, i) => (
                <div key={i} className="site-card site-notice-row">
                  <span className="site-date-tile"><b>{date(e.from, { day: "numeric" })}</b><small>{date(e.from, { month: "short" })}</small></span>
                  <span className="site-notice-text"><b>{e.event}</b>
                    <small>{e.to ? `${date(e.from, { day: "numeric", month: "long" })} – ${date(e.to)}` : date(e.from, { weekday: "long", day: "numeric", month: "long" })}{e.exam ? ` · ${t("Exam")}` : ""}</small></span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

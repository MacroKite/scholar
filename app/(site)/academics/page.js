import { sitePage, PageHead } from "@/components/site/parts.js";
import { GROUPS, GROUP_LABELS, sectionGroup, shiftOfSection } from "@/lib/school/rules.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("Academics")} · ${data?.school ?? "Scholar"}` };
}

export default async function Academics() {
  const { t, data, date, time } = await sitePage();
  if (!data) return null;
  const { classes, schedule } = data;
  const className = (id) => t.data(classes.find((c) => c.id === id)?.name ?? "");
  const weekday = (d) => new Date(2023, 0, 1 + d).toLocaleDateString(t.lang === "bn" ? "bn-BD" : "en-GB", { weekday: "long" });
  const sectionsOf = (c) => c.sections.map((s) => { const g = sectionGroup(c, s); return g ? `${s} (${t(GROUP_LABELS[g])})` : s; }).join(", ");
  // Classes 9–10: each group's subjects (religion subjects as one line, 4th subjects marked).
  const senior = classes.find((c) => c.level === 9 && GROUPS.some((g) => c.sections.some((s) => sectionGroup(c, s) === g)));
  const groupSubjects = (g) => {
    const list = senior.subjects.filter((sub) => { const r = senior.subjectRules?.[sub]; return !r?.groups?.length || r.groups.includes(g); });
    const plain = list.filter((sub) => !senior.subjectRules?.[sub]?.religion && !senior.subjectRules?.[sub]?.optional).map((sub) => t.data(sub));
    const religion = list.some((sub) => senior.subjectRules?.[sub]?.religion) ? [t("Religion and Moral Education (by religion)")] : [];
    const optional = list.filter((sub) => senior.subjectRules?.[sub]?.optional).map((sub) => t.data(sub));
    return { subjects: [...plain, ...religion], optional };
  };
  // Which classes come in each shift.
  const shiftClasses = (id) => classes.filter((c) => c.sections.some((s) => shiftOfSection(schedule, c, s).id === id)).map((c) => t.data(c.short));
  // Exams coming up, by exam.
  const byTerm = {};
  data.exams.forEach((e) => { (byTerm[e.term] ||= []).push(e); });
  return (
    <>
      <PageHead eyebrow={t("Academics")} title={t("Classes, subjects and school hours")}>{t("Academic year {year}", { year: t.digits(data.year) })}</PageHead>
      <div className="site-wrap site-body">
        <section className="site-section">
          <h2>{t("Classes")}</h2>
          <div className="site-card site-table"><table className="tbl"><thead><tr><th>{t("Class")}</th><th>{t("Sections")}</th><th>{t("Subjects")}</th></tr></thead>
            <tbody>{classes.map((c) => <tr key={c.id}><td className="strong">{t.data(c.name)}</td><td>{sectionsOf(c)}</td><td className="t2">{c.level >= 9 ? t("By group") : c.subjects.map((s) => t.data(s)).join(", ")}</td></tr>)}</tbody></table></div>
        </section>

        {senior && (
          <section className="site-section">
            <h2>{t("Groups in Classes Nine and Ten")}</h2>
            <p className="site-note">{t("Each student also picks a 4th subject. A subject is passed with 33% in each part (creative, MCQ and practical).")}</p>
            <div className="site-cards-3">
              {GROUPS.filter((g) => senior.sections.some((s) => sectionGroup(senior, s) === g) || classes.some((c) => c.level === 10 && c.sections.some((s) => sectionGroup(c, s) === g))).map((g) => {
                const x = groupSubjects(g);
                return (
                  <div key={g} className="site-card">
                    <h3>{t(GROUP_LABELS[g])}</h3>
                    <ul className="site-list">{x.subjects.map((s) => <li key={s}>{s}</li>)}</ul>
                    {x.optional.length > 0 && <p className="site-note">{t("4th subject: {list}", { list: x.optional.join(", ") })}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="site-section">
          <h2>{t("School hours")}</h2>
          <p className="site-note">{t("The school is open on {days}.", { days: schedule.days.map(weekday).join(", ") })}</p>
          <div className="site-cards-3">
            {schedule.shifts.map((sh) => (
              <div key={sh.id} className="site-card">
                <h3>{t.data(sh.name)}</h3>
                <p className="site-big">{time(sh.periods[0][0])} – {time(sh.periods.at(-1)[1])}</p>
                <p className="site-note">{t("{n} periods a day", { n: t.digits(sh.periods.length) })}{schedule.shifts.length > 1 && shiftClasses(sh.id).length ? ` · ${t("Classes {list}", { list: shiftClasses(sh.id).join(", ") })}` : ""}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="site-section">
          <h2>{t("Exam routine")}</h2>
          {Object.keys(byTerm).length === 0 ? <p className="site-note">{t("No exams are scheduled right now.")}</p> : Object.entries(byTerm).map(([term, list]) => (
            <div key={term} className="site-card site-table site-gap">
              <h3>{t.term(term)}</h3>
              <table className="tbl"><thead><tr><th>{t("Date")}</th><th>{t("Class")}</th><th>{t("Subject")}</th><th className="r">{t("Time")}</th></tr></thead>
                <tbody>{list.slice(0, 80).map((e, i) => <tr key={i}><td className="nowrap">{date(e.date, { weekday: "short", day: "numeric", month: "short" })}</td><td>{className(e.classId)}</td><td className="strong">{t.data(e.subject)}</td><td className="r">{time(e.start)}</td></tr>)}</tbody></table>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

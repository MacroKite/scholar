import { sitePage, Icon, SchoolArt, ResultsTable } from "@/components/site/parts.js";
import { lines, resultsOf } from "@/lib/school/website.js";

export async function generateMetadata() {
  const { data } = await sitePage();
  return { title: data?.school ?? "Scholar", description: data?.website.tagline || undefined };
}

export default async function Home() {
  const { t, data, date, num } = await sitePage();
  if (!data) return null;
  const w = data.website;
  const results = resultsOf(w), latest = results[0];
  const message = w.principalMessage.split("\n").find(Boolean) ?? "";
  const facts = [
    w.established && t("Established {year}", { year: num(w.established) }),
    w.eiin && t("EIIN {eiin}", { eiin: w.eiin }),
    w.board && t.data(w.board),
  ].filter(Boolean);
  return (
    <>
      <section className="site-hero">
        <div className="site-wrap site-hero-in">
          <div className="site-hero-text">
            {facts.length > 0 && <div className="site-eyebrow">{facts.join(" · ")}</div>}
            <h1>{data.school}</h1>
            {w.tagline && <p className="site-lead">{w.tagline}</p>}
            <div className="site-cta">
              {w.admissionOpen && <a className="btn primary" href="/admission">{w.admissionSession ? t("Admission {session} is open", { session: num(w.admissionSession) }) : t("Admission is open")}</a>}
              <a className="btn" href="/contact">{t("Contact us")}</a>
            </div>
          </div>
          <div className="site-hero-art">{w.heroImage ? <img src={w.heroImage} alt={data.school} /> : <SchoolArt />}</div>
        </div>
      </section>

      {data.notices.length > 0 && (
        <section className="site-wrap site-notices">
          <div className="site-notices-head"><Icon name="megaphone" /><b>{t("Latest notices")}</b><a href="/notices">{t("All notices")} <Icon name="arrow" size={14} /></a></div>
          <div className="site-notice-list">
            {data.notices.slice(0, 3).map((n) => (
              <a key={n.id} href={`/notices/${n.id}`} className="site-notice">
                <span className="site-date">{date(n.date, { day: "numeric", month: "short" })}</span>
                <span className="site-notice-topic">{n.topic}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="site-wrap site-stats">
        <div><b>{num(data.counts.students)}</b><span>{t("Students")}</span></div>
        <div><b>{num(data.counts.teachers)}</b><span>{t("Teachers")}</span></div>
        <div><b>{num(data.counts.classes)}</b><span>{t("Classes")}</span></div>
        {latest && <div><b>{num(Math.round((latest.passed / latest.examinees) * 100))}%</b><span>{t("SSC pass rate {year}", { year: num(latest.year) })}</span></div>}
      </section>

      {message && (
        <section className="site-wrap site-split">
          <div className="site-card site-quote">
            <div className="site-eyebrow">{t("Message from the Principal")}</div>
            <p>{message}</p>
            <div className="site-sign"><span className="avatar lg">{data.principal.split(" ").slice(0, 2).map((x) => x[0]).join("")}</span><span><b>{data.principal}</b><small>{t("Principal")}</small></span></div>
            <a className="site-more" href="/about#principal">{t("Read the full message")} <Icon name="arrow" size={14} /></a>
          </div>
          {(w.mission || w.vision) && (
            <div className="site-card">
              {w.mission && <><h3>{t("Our mission")}</h3><p>{w.mission}</p></>}
              {w.vision && <><h3>{t("Our vision")}</h3><p>{w.vision}</p></>}
              <a className="site-more" href="/about">{t("About the school")} <Icon name="arrow" size={14} /></a>
            </div>
          )}
        </section>
      )}

      {lines(w.facilities).length > 0 && (
        <section className="site-wrap site-section">
          <h2>{t("Facilities")}</h2>
          <div className="site-grid">{lines(w.facilities).map((f) => <div key={f} className="site-feature"><span className="site-tick"><Icon name="check" size={16} /></span>{f}</div>)}</div>
        </section>
      )}

      {results.length > 0 && (
        <section className="site-wrap site-section">
          <h2>{t("SSC results")}</h2>
          <ResultsTable results={results} t={t} num={num} />
        </section>
      )}

      {w.admissionOpen && (
        <section className="site-wrap">
          <div className="site-band">
            <div><h2>{w.admissionSession ? t("Admission {session} is open", { session: num(w.admissionSession) }) : t("Admission is open")}</h2>
              <p>{w.admissionDeadline ? t("Apply by {date}. See who can apply, the documents you need and the fees.", { date: date(w.admissionDeadline) }) : t("See who can apply, the documents you need and the fees.")}</p></div>
            <a className="btn" href="/admission">{t("Admission details")}</a>
          </div>
        </section>
      )}
    </>
  );
}


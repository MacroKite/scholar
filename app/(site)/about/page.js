import { sitePage, PageHead, Icon, ResultsTable } from "@/components/site/parts.js";
import { lines, committeeOf, resultsOf } from "@/lib/school/website.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("About")} · ${data?.school ?? "Scholar"}` };
}

export default async function About() {
  const { t, data, num } = await sitePage();
  if (!data) return null;
  const w = data.website, committee = committeeOf(w), results = resultsOf(w);
  return (
    <>
      <PageHead eyebrow={t("About")} title={data.school}>{w.tagline}</PageHead>
      <div className="site-wrap site-body">
        {w.history && <section className="site-section"><h2>{t("Our history")}</h2>{w.history.split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</section>}
        {(w.mission || w.vision) && (
          <section className="site-split">
            {w.mission && <div className="site-card"><h3>{t("Our mission")}</h3><p>{w.mission}</p></div>}
            {w.vision && <div className="site-card"><h3>{t("Our vision")}</h3><p>{w.vision}</p></div>}
          </section>
        )}
        {w.principalMessage && (
          <section className="site-section" id="principal">
            <h2>{t("Message from the Principal")}</h2>
            <div className="site-card site-quote">
              {w.principalMessage.split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
              <div className="site-sign"><span className="avatar lg">{data.principal.split(" ").slice(0, 2).map((x) => x[0]).join("")}</span><span><b>{data.principal}</b><small>{t("Principal")}, {data.school}</small></span></div>
            </div>
          </section>
        )}
        {committee.length > 0 && (
          <section className="site-section">
            <h2>{t("Managing committee")}</h2>
            <div className="site-card site-table"><table className="tbl"><thead><tr><th>{t("Name")}</th><th>{t("Position")}</th></tr></thead>
              <tbody>{committee.map((m) => <tr key={m.name}><td className="strong">{m.name}</td><td className="t2">{m.role}</td></tr>)}</tbody></table></div>
          </section>
        )}
        {lines(w.achievements).length > 0 && (
          <section className="site-section">
            <h2>{t("Achievements")}</h2>
            <div className="site-grid">{lines(w.achievements).map((a) => <div key={a} className="site-feature"><span className="site-tick"><Icon name="award" size={16} /></span>{a}</div>)}</div>
          </section>
        )}
        {results.length > 0 && <section className="site-section"><h2>{t("SSC results")}</h2><ResultsTable results={results} t={t} num={num} /></section>}
        {lines(w.facilities).length > 0 && (
          <section className="site-section">
            <h2>{t("Facilities")}</h2>
            <div className="site-grid">{lines(w.facilities).map((f) => <div key={f} className="site-feature"><span className="site-tick"><Icon name="check" size={16} /></span>{f}</div>)}</div>
          </section>
        )}
      </div>
    </>
  );
}

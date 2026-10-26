import { notFound } from "next/navigation";
import { sitePage, PageHead, Officer, Icon } from "@/components/site/parts.js";
import { charterOf, officerOf, needsCharter } from "@/lib/school/website.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("Citizen's charter")} · ${data?.school ?? "Scholar"}` };
}

// The citizen's charter (services, how to get them, how long and what they
// cost), and who handles complaints (GRS) and integrity (NIS). Government
// schools must publish these; others may.
export default async function Charter() {
  const { t, data } = await sitePage();
  if (!data) return null;
  const w = data.website, services = charterOf(w), grs = officerOf(w.grsOfficer), nis = officerOf(w.nisOfficer);
  if (!needsCharter(w) && !services.length) notFound();
  return (
    <>
      <PageHead eyebrow={t("Citizen's charter")} title={t("Citizen's charter")}>{t("The services the school gives, how to get them, how long they take and what they cost.")}</PageHead>
      <div className="site-wrap site-body">
        <section className="site-section">
          <h2>{t("Services")}</h2>
          {services.length === 0 ? <p className="site-note">{t("The charter will be published soon. Until then, ask the school office.")}</p> : (
            <div className="site-card site-table"><table className="tbl">
              <thead><tr><th>{t("Service")}</th><th>{t("How to get it")}</th><th>{t("Time")}</th><th>{t("Cost")}</th></tr></thead>
              <tbody>{services.map((s, i) => <tr key={i}><td className="strong">{s.service}</td><td className="t2">{s.how}</td><td className="nowrap">{s.time}</td><td className="nowrap">{s.cost}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
        {(grs || nis) && (
          <section className="site-section">
            <h2>{t("Complaints and integrity")}</h2>
            <div className="site-officers">
              {grs && <Officer title={t("Grievance (GRS) focal point")} o={grs} />}
              {nis && <Officer title={t("Integrity (NIS) focal point")} o={nis} />}
            </div>
            <p className="site-note">{t("You can also make a complaint online through the government's grievance system.")} <a className="site-more" href="https://www.grs.gov.bd" target="_blank" rel="noopener">grs.gov.bd <Icon name="arrow" size={14} /></a></p>
          </section>
        )}
      </div>
    </>
  );
}

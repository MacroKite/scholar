import { notFound } from "next/navigation";
import { sitePage, PageHead, Officer, Icon } from "@/components/site/parts.js";
import EnquiryForm from "@/components/site/EnquiryForm.js";
import { officerOf, needsRti, needsCharter, calendarOf, downloadsOf } from "@/lib/school/website.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("Right to Information")} · ${data?.school ?? "Scholar"}` };
}

// Right to Information Act 2009: who answers requests, who hears appeals,
// and how to ask. Government and MPO schools must have this; a private
// school shows it once it names an officer.
export default async function Rti() {
  const { lang, t, data } = await sitePage();
  if (!data) return null;
  const w = data.website;
  const officer = officerOf(w.rtiOfficer), appeal = officerOf(w.rtiAppeal);
  if (!needsRti(w) && !officer) notFound();
  // Until an officer is named, requests go to the head of the school.
  const head = officer ?? { name: data.principal, post: t("Head of the school"), phone: w.headPhone || w.phone, email: w.headEmail || w.email };
  const steps = [
    t("Write to the information officer: use the form on this page, email them, or hand in a written application (Form Ka)."),
    t("Say what information you want, and whether you want a copy, an email or to see it in person."),
    t("The officer must give the information within 20 working days, or 30 if other offices are involved."),
    t("No answer, or not satisfied? Appeal to the appeal authority within 30 days."),
    t("If the appeal doesn't settle it, you can complain to the Information Commission."),
  ];
  const published = [
    ["/about", t("About the school")], ["/admission", t("Admission")], ["/notices", t("Notices")], ["/academics", t("Academics")],
    ...(calendarOf(w).length ? [["/calendar", t("Academic calendar")]] : []),
    ...(downloadsOf(w).length ? [["/downloads", t("Downloads")]] : []),
    ...(needsCharter(w) ? [["/charter", t("Citizen's charter")]] : []),
  ];
  return (
    <>
      <PageHead eyebrow={t("Right to Information")} title={t("Right to Information")}>{t("Under the Right to Information Act 2009, anyone may ask the school for information it holds.")}</PageHead>
      <div className="site-wrap site-body site-two">
        <div>
          <section className="site-section">
            <div className="site-officers">
              <Officer title={t("Information officer")} o={head} />
              {appeal && <Officer title={t("Appeal authority")} o={appeal} />}
            </div>
          </section>
          <section className="site-section">
            <h2>{t("How to ask")}</h2>
            <ol className="site-steps">{steps.map((s, i) => <li key={i}><span>{t.digits(String(i + 1))}</span>{s}</li>)}</ol>
            <a className="site-more" href="https://infocom.gov.bd" target="_blank" rel="noopener">{t("Information Commission website")} <Icon name="arrow" size={14} /></a>
          </section>
          <section className="site-section">
            <h2>{t("Information we publish")}</h2>
            <div className="site-grid">{published.map(([href, label]) => <a key={href} href={href} className="site-feature"><span className="site-tick"><Icon name="check" size={16} /></span>{label}</a>)}</div>
          </section>
        </div>
        <aside className="site-aside"><EnquiryForm kind="rti" lang={lang} /></aside>
      </div>
    </>
  );
}

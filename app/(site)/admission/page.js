import { sitePage, PageHead, Icon } from "@/components/site/parts.js";
import EnquiryForm from "@/components/site/EnquiryForm.js";
import { lines } from "@/lib/school/website.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("Admission")} · ${data?.school ?? "Scholar"}` };
}

export default async function Admission() {
  const { lang, t, data, date, num } = await sitePage();
  if (!data) return null;
  const w = data.website;
  const money = (n) => t.digits(`৳${Math.round(n).toLocaleString("en-IN")}`);
  const docs = lines(w.admissionDocuments), steps = lines(w.admissionSteps);
  return (
    <>
      <PageHead eyebrow={t("Admission")} title={w.admissionSession ? t("Admission {session}", { session: num(w.admissionSession) }) : t("Admission")}>
        {w.admissionOpen ? (w.admissionDeadline ? t("Admission is open. Apply by {date}.", { date: date(w.admissionDeadline) }) : t("Admission is open.")) : t("Admission is closed right now. Send an enquiry and we'll let you know when it opens.")}
      </PageHead>
      <div className="site-wrap site-body site-two">
        <div>
          {w.admissionEligibility && <section className="site-section"><h2>{t("Who can apply")}</h2>{w.admissionEligibility.split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</section>}
          {steps.length > 0 && (
            <section className="site-section"><h2>{t("How to apply")}</h2>
              <ol className="site-steps">{steps.map((s, i) => <li key={i}><span>{num(i + 1)}</span>{s}</li>)}</ol></section>
          )}
          {docs.length > 0 && (
            <section className="site-section"><h2>{t("Documents you need")}</h2>
              <div className="site-grid">{docs.map((d) => <div key={d} className="site-feature"><span className="site-tick"><Icon name="check" size={16} /></span>{d}</div>)}</div></section>
          )}
          <section className="site-section">
            <h2>{t("Monthly tuition fees")}</h2>
            <div className="site-card site-table"><table className="tbl"><thead><tr><th>{t("Class")}</th><th className="r">{t("Monthly tuition")}</th></tr></thead>
              <tbody>{data.classes.map((c) => <tr key={c.id}><td className="strong">{t.data(c.name)}</td><td className="r">{money(c.fee)}</td></tr>)}</tbody></table></div>
            <p className="site-note">{t("Admission and session fees are paid once a year. Ask the school office for the current amounts.")}</p>
          </section>
        </div>
        <aside className="site-aside">
          <EnquiryForm kind="admission" lang={lang} classes={data.classes.map((c) => c.name)} />
          {w.phone && <div className="site-card site-callout"><Icon name="phone" /><div><b>{t("Call the office")}</b><span>{w.phone}</span>{w.officeHours && <small>{w.officeHours}</small>}</div></div>}
        </aside>
      </div>
    </>
  );
}

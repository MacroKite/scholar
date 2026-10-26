import { sitePage, PageHead, Icon } from "@/components/site/parts.js";
import EnquiryForm from "@/components/site/EnquiryForm.js";
import { mapEmbed } from "@/lib/school/website.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("Contact")} · ${data?.school ?? "Scholar"}` };
}

export default async function Contact() {
  const { lang, t, data } = await sitePage();
  if (!data) return null;
  const w = data.website, embed = mapEmbed(w.mapUrl);
  const rows = [
    ["pin", t("Address"), w.address],
    ["phone", t("Phone"), w.phone],
    ["mail", t("Email"), w.email && <a href={`mailto:${w.email}`}>{w.email}</a>],
    ["clock", t("Office hours"), w.officeHours],
    ["facebook", t("Facebook"), w.facebook && <a href={w.facebook} target="_blank" rel="noopener">{t("Our Facebook page")}</a>],
  ].filter(([, , v]) => v);
  return (
    <>
      <PageHead eyebrow={t("Contact")} title={t("Get in touch")}>{t("Visit us, call the office, or send a message and we'll call you back.")}</PageHead>
      <div className="site-wrap site-body site-two">
        <div>
          <div className="site-card site-contact-card">
            {rows.map(([ic, label, v]) => <div key={label} className="site-contact-row"><span className="site-tick"><Icon name={ic} size={16} /></span><div><small>{label}</small><span>{v}</span></div></div>)}
          </div>
          {embed ? <iframe className="site-map" src={embed} title={t("Map")} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            : w.mapUrl ? <a className="btn" href={w.mapUrl} target="_blank" rel="noopener">{t("Open in Google Maps")}</a> : null}
        </div>
        <aside className="site-aside"><EnquiryForm kind="contact" lang={lang} /></aside>
      </div>
    </>
  );
}

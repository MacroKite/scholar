import { sitePage, PageHead, Icon } from "@/components/site/parts.js";
import { downloadsOf, isLink } from "@/lib/school/website.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("Downloads")} · ${data?.school ?? "Scholar"}` };
}

// Forms, circulars and the prospectus, as links the admin adds.
export default async function Downloads() {
  const { t, data } = await sitePage();
  if (!data) return null;
  const w = data.website;
  const list = [
    ...(isLink(w.admissionNotice) ? [{ title: t("Admission notice"), url: w.admissionNotice }] : []),
    ...downloadsOf(w),
  ];
  return (
    <>
      <PageHead eyebrow={t("Downloads")} title={t("Forms and documents")}>{t("Application forms, circulars and other documents from the school office.")}</PageHead>
      <div className="site-wrap site-body">
        {list.length === 0 ? <p className="site-note site-section">{t("Nothing to download yet.")}</p> : (
          <div className="site-notice-full site-section">
            {list.map((d) => (
              <a key={d.url} href={d.url} target="_blank" rel="noopener" className="site-card site-notice-row">
                <span className="site-tick"><Icon name="book" size={16} /></span>
                <span className="site-notice-text"><b>{d.title}</b></span>
                <span className="site-download">{t("Download")} <Icon name="arrow" size={14} /></span>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

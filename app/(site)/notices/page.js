import { sitePage, PageHead } from "@/components/site/parts.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("Notices")} · ${data?.school ?? "Scholar"}` };
}

// Notices the school posted for everyone (not those only for staff or families).
export default async function Notices() {
  const { t, data, date } = await sitePage();
  if (!data) return null;
  return (
    <>
      <PageHead eyebrow={t("Notices")} title={t("Notice board")}>{t("Announcements from the school office.")}</PageHead>
      <div className="site-wrap site-body">
        {data.notices.length === 0 ? <p className="site-note">{t("No notices yet.")}</p> : (
          <div className="site-notice-full">
            {data.notices.map((n) => (
              <a key={n.id} href={`/notices/${n.id}`} className="site-card site-notice-row">
                <span className="site-date-tile"><b>{date(n.date, { day: "numeric" })}</b><small>{date(n.date, { month: "short" })}</small></span>
                <span className="site-notice-text"><b>{n.topic}</b><span>{n.body.length > 180 ? `${n.body.slice(0, 180)}…` : n.body}</span><small>{t("No. {number}", { number: n.number })} · {date(n.date)}</small></span>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

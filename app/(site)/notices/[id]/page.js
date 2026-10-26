import { notFound } from "next/navigation";
import { sitePage } from "@/components/site/parts.js";

async function noticeFor(params) {
  const { id } = await params;
  const page = await sitePage();
  return { ...page, notice: page.data?.notices.find((n) => n.id === id) };
}

export async function generateMetadata({ params }) {
  const { notice, data } = await noticeFor(params);
  return { title: notice ? `${notice.topic} · ${data.school}` : data?.school ?? "Scholar" };
}

export default async function Notice({ params }) {
  const { t, date, notice } = await noticeFor(params);
  if (!notice) notFound();
  return (
    <div className="site-wrap site-body site-narrow">
      <a className="back" href="/notices">← {t("All notices")}</a>
      <article className="site-card site-article">
        <div className="site-eyebrow">{t("No. {number}", { number: notice.number })} · {date(notice.date)}</div>
        <h1>{notice.topic}</h1>
        {notice.body.split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
      </article>
    </div>
  );
}

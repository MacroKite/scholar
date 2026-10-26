import { notFound } from "next/navigation";
import { sitePage, PageHead } from "@/components/site/parts.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("Teachers")} · ${data?.school ?? "Scholar"}` };
}

// Names and subjects only: no phone numbers or emails.
export default async function Teachers() {
  const { t, data, num } = await sitePage();
  if (!data) return null;
  if (!data.website.showTeachers) notFound();
  const tone = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 5; };
  return (
    <>
      <PageHead eyebrow={t("Teachers")} title={t("Our teachers")}>{t("{n} teachers across the school.", { n: num(data.teachers.length) })}</PageHead>
      <div className="site-wrap site-body">
        <div className="site-people">
          {data.teachers.map((x) => (
            <div key={x.id} className="site-card site-person">
              <span className={`avatar xl c${tone(x.id)}`}>{x.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</span>
              <b>{x.name}</b>
              <span>{t("{subject} teacher", { subject: t.data(x.subject) })}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

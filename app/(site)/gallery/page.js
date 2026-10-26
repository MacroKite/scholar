import { sitePage, PageHead } from "@/components/site/parts.js";
import { galleryOf } from "@/lib/school/website.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("Gallery")} · ${data?.school ?? "Scholar"}` };
}

export default async function Gallery() {
  const { t, data } = await sitePage();
  if (!data) return null;
  const photos = galleryOf(data.website);
  return (
    <>
      <PageHead eyebrow={t("Gallery")} title={t("School life in pictures")} />
      <div className="site-wrap site-body">
        {photos.length === 0 ? <p className="site-note">{t("Photos will be added soon.")}</p> : (
          <div className="site-gallery">
            {photos.map((p, i) => (
              <figure key={i} className="site-photo">
                <img src={p.url} alt={p.caption || data.school} loading="lazy" />
                {p.caption && <figcaption>{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

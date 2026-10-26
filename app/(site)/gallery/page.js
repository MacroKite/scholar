import { sitePage, PageHead } from "@/components/site/parts.js";
import { photosOf } from "@/components/site/photos.js";

export async function generateMetadata() {
  const { t, data } = await sitePage();
  return { title: `${t("Gallery")} · ${data?.school ?? "Scholar"}` };
}

export default async function Gallery() {
  const { t, data } = await sitePage();
  if (!data) return null;
  const photos = photosOf(data.website).life;
  return (
    <>
      <PageHead eyebrow={t("Gallery")} title={t("School life in pictures")} />
      <div className="site-wrap site-body">
        <div className="site-gallery">
          {photos.map((p, i) => {
            const caption = p.stock ? t(p.caption) : p.caption;
            return (
              <figure key={i} className="site-photo">
                <img src={p.url} alt={caption || data.school} loading="lazy" />
                {caption && <figcaption>{caption}</figcaption>}
              </figure>
            );
          })}
        </div>
      </div>
    </>
  );
}

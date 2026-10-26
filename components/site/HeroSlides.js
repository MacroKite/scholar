"use client";

import { useEffect, useState } from "react";

// The home page's photos behind the hero, changing every few seconds, with
// arrows and dots. One photo just sits there; none leaves the green backdrop.
export default function HeroSlides({ photos, labels }) {
  const [at, setAt] = useState(0);
  const n = photos.length;
  const go = (d) => setAt((x) => (x + d + n) % n);
  useEffect(() => {
    if (n < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setAt((x) => (x + 1) % n), 6000);
    return () => clearInterval(id);
  }, [n, at]);
  if (!n) return null;
  const arrow = (d) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
  return (
    <>
      <div className="site-hero-photos" aria-hidden="true">
        {photos.map((url, i) => <img key={url} src={url} alt="" className={i === at ? "on" : ""} loading={i ? "lazy" : "eager"} />)}
      </div>
      {n > 1 && (
        <>
          <button type="button" className="site-hero-arrow prev" aria-label={labels.prev} onClick={() => go(-1)}>{arrow("m15 18-6-6 6-6")}</button>
          <button type="button" className="site-hero-arrow next" aria-label={labels.next} onClick={() => go(1)}>{arrow("m9 18 6-6-6-6")}</button>
          <div className="site-hero-dots">
            {photos.map((url, i) => <button key={url} type="button" className={i === at ? "on" : ""} aria-label={`${labels.photo} ${i + 1}`} onClick={() => setAt(i)} />)}
          </div>
        </>
      )}
    </>
  );
}

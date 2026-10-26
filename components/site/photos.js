// Scholar — stock photos (from Unsplash, free to use) that dress the website
// until the school adds its own on the Website page. The school's main photo
// and gallery always come first; these only fill the gaps.

import { galleryOf } from "@/lib/school/website.js";

const p = (name) => `/site/${name}.jpg`;

const HERO = ["hero-campus", "hero-classroom", "hero-graduation"].map(p);
// School life, with captions (translated by the page).
const LIFE = [
  ["sports-track", "Sports day"], ["hands-up", "In the classroom"], ["science", "Science club"],
  ["football", "Football on the school field"], ["writing", "Class work"], ["teacher", "A lesson in progress"],
  ["reading", "Reading time"], ["library", "The library"],
].map(([name, caption]) => ({ url: p(name), caption, stock: true }));
// A photo for each kind of facility (keys match facilityIcon()).
const FACILITY = { flask: "lab", monitor: "computer", book: "library", bus: "bus", shield: "cctv", heart: "first-aid", moon: "prayer", ball: "football", home: "classroom" };
const FILLERS = ["classroom", "hands-up", "teacher", "writing"];

// The website's photos: the school's own where it has them.
export function photosOf(w) {
  const own = galleryOf(w);
  const life = own.length ? own : LIFE;
  return {
    hero: w.heroImage ? [w.heroImage, ...own.map((x) => x.url)].slice(0, 5) : own.length >= 2 ? own.slice(0, 5).map((x) => x.url) : HERO,
    welcome: own[1]?.url ?? own[0]?.url ?? p("welcome"),
    growth: own[2]?.url ?? p("growth"),
    banner: w.heroImage || own[0]?.url || HERO[0],
    life,
  };
}
export const facilityPhoto = (icon, i) => p(FACILITY[icon] ?? FILLERS[i % FILLERS.length]);

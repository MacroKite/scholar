import { sitePage, Icon, ResultsTable, facilityIcon } from "@/components/site/parts.js";
import HeroSlides from "@/components/site/HeroSlides.js";
import { photosOf, facilityPhoto } from "@/components/site/photos.js";
import { lines, resultsOf } from "@/lib/school/website.js";
import { GROUPS, GROUP_LABELS, sectionGroup } from "@/lib/school/rules.js";

export async function generateMetadata() {
  const { data } = await sitePage();
  return { title: data?.school ?? "Scholar", description: data?.website.tagline || undefined };
}

// A heading with the small gold label above it.
const Heading = ({ eyebrow, title, children }) => (
  <div className="site-heading">
    <div><div className="site-eyebrow">{eyebrow}</div><h2>{title}</h2></div>
    {children}
  </div>
);

export default async function Home() {
  const { t, data, date, num, time } = await sitePage();
  if (!data) return null;
  const w = data.website, { classes, schedule } = data;
  const results = resultsOf(w), latest = results[0];
  const rate = (r) => Math.round((r.passed / r.examinees) * 100);
  const photos = photosOf(w);
  const facilities = lines(w.facilities);
  const paras = (text) => text.split("\n").filter(Boolean);
  const intro = paras(w.history)[0] ?? paras(w.principalMessage)[0] ?? "";
  const admission = w.admissionSession ? t("Admission {session} is open", { session: num(w.admissionSession) }) : t("Admission is open");

  // The tagline as the headline, its last two words in gold.
  const words = (w.tagline || data.school).split(" ");
  const cut = words.length > 3 ? words.length - 2 : words.length;
  const headline = <>{words.slice(0, cut).join(" ")}{cut < words.length && <> <em>{words.slice(cut).join(" ")}</em></>}</>;

  // The strip under the hero: what parents look for first.
  const shift = schedule.shifts[0];
  const strip = [
    data.notices[0] && { icon: "megaphone", title: t("Latest notice"), text: data.notices[0].topic, href: `/notices/${data.notices[0].id}` },
    w.admissionOpen && { icon: "cap", title: w.admissionSession ? t("Admission {session}", { session: num(w.admissionSession) }) : t("Admission"), text: w.admissionDeadline ? t("Apply by {date}", { date: date(w.admissionDeadline, { day: "numeric", month: "long" }) }) : t("Admission is open"), href: "/admission" },
    shift && { icon: "clock", title: t("School hours"), text: `${time(shift.periods[0][0])} – ${time(shift.periods.at(-1)[1])}`, href: "/academics" },
    latest && { icon: "award", title: t("SSC {year}", { year: num(latest.year) }), text: t("{rate}% passed, {n} GPA 5", { rate: num(rate(latest)), n: num(latest.gpa5) }), href: "/about" },
    w.phone && { icon: "phone", title: t("Call the office"), text: w.phone.split(",")[0].trim(), href: "/contact" },
  ].filter(Boolean);

  // Academics cards.
  const sections = classes.reduce((n, c) => n + c.sections.length, 0);
  const groups = GROUPS.filter((g) => classes.some((c) => c.sections.some((s) => sectionGroup(c, s) === g)));
  const nextExam = data.exams[0];
  const academics = [
    classes.length > 0 && { icon: "book", title: t("Our classes"), text: t("{first} to {last}, with {n} sections in all.", { first: t.data(classes[0].name), last: t.data(classes.at(-1).name), n: num(sections) }) },
    w.showTeachers && { icon: "users", title: t("Our teachers"), text: t("{n} teachers across the school.", { n: num(data.counts.teachers) }), href: "/teachers" },
    groups.length > 0 && { icon: "bulb", title: t("Groups in Classes Nine and Ten"), text: groups.map((g) => t(GROUP_LABELS[g])).join(", ") },
    { icon: "calendar", title: t("Exam routine"), text: nextExam ? t("{term} starts {date}.", { term: t.term(nextExam.term), date: date(nextExam.date, { day: "numeric", month: "long" }) }) : t("No exams are scheduled right now.") },
  ].filter(Boolean).slice(0, 4);

  const years = w.established ? new Date().getFullYear() - Number(w.established) : 0;
  const stats = [
    years > 0 && [`${num(years)}+`, t("Years of teaching")],
    [num(data.counts.students), t("Students")],
    [num(data.counts.teachers), t("Teachers")],
    latest && [`${num(rate(latest))}%`, t("SSC pass rate {year}", { year: num(latest.year) })],
  ].filter(Boolean);

  return (
    <>
      <section className="site-hero has-photo">
        <HeroSlides photos={photos.hero} labels={{ prev: t("Previous photo"), next: t("Next photo"), photo: t("Photo") }} />
        <div className="site-wrap site-hero-in">
          {w.established && <div className="site-eyebrow">{t("Established {year}", { year: num(w.established) })}{w.eiin && ` · ${t("EIIN {eiin}", { eiin: w.eiin })}`}</div>}
          <h1>{headline}</h1>
          {w.mission && <p className="site-lead">{w.mission}</p>}
          <div className="site-cta">
            {w.admissionOpen && <a className="btn gold" href="/admission">{admission} <Icon name="arrow" size={16} /></a>}
            <a className="btn ghost" href="/about">{t("About the school")} <Icon name="arrow" size={16} /></a>
          </div>
        </div>
      </section>

      {strip.length > 0 && (
        <section className="site-wrap">
          <div className="site-strip">
            {strip.map((x) => (
              <a key={x.title} href={x.href}>
                <Icon name={x.icon} size={30} />
                <span><b>{x.title}</b><small>{x.text}</small></span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="site-wrap site-welcome">
        <div className="site-welcome-photo"><img src={photos.welcome} alt={data.school} /></div>
        <div>
          <div className="site-eyebrow">{t("Welcome to")}</div>
          <h2>{data.school}</h2>
          {intro && <p>{intro}</p>}
          <div className="site-stats">{stats.map(([n, label]) => <div key={label}><b>{n}</b><span>{label}</span></div>)}</div>
          <a className="btn green" href="/about">{t("Read more about us")} <Icon name="arrow" size={16} /></a>
        </div>
      </section>

      <section className="site-wrap site-section site-academics">
        <div>
          <Heading eyebrow={t("Academics")} title={t("Explore. Learn. Excel.")} />
          <div className="site-cards-4">
            {academics.map((x) => (
              <a key={x.title} href={x.href ?? "/academics"} className="site-card site-icon-card">
                <Icon name={x.icon} size={36} />
                <b>{x.title}</b>
                <span>{x.text}</span>
              </a>
            ))}
          </div>
        </div>
        <figure className="site-growth">
          <img src={photos.growth} alt="" />
          <figcaption><b>{t("Holistic growth")}</b><span>{t("Mind · Body · Values")}</span></figcaption>
        </figure>
      </section>

      {facilities.length > 0 && (
        <section className="site-wrap site-section">
          <Heading eyebrow={t("Facilities")} title={t("Our campus")} />
          <div className="site-facilities">
            {facilities.slice(0, 4).map((f, i) => (
              <div key={f} className="site-card site-facility">
                <img src={facilityPhoto(facilityIcon(f), i)} alt="" loading="lazy" />
                <span className="site-facility-badge"><Icon name={facilityIcon(f)} size={20} /></span>
                <b>{f}</b>
              </div>
            ))}
          </div>
          {facilities.length > 4 && <div className="site-center"><a className="btn outline" href="/about#facilities">{t("All facilities")} <Icon name="arrow" size={14} /></a></div>}
        </section>
      )}

      <section className="site-wrap site-section">
        <Heading eyebrow={t("School life")} title={t("Learning beyond classrooms")}><a className="btn outline" href="/gallery">{t("View gallery")} <Icon name="arrow" size={14} /></a></Heading>
        <div className="site-film">{photos.life.slice(0, 5).map((p, i) => <img key={i} src={p.url} alt={p.stock ? t(p.caption) : p.caption || data.school} loading="lazy" />)}</div>
      </section>

      {(data.notices.length > 0 || results.length > 0) && (
        <section className="site-wrap site-section site-split">
          {data.notices.length > 0 && (
            <div>
              <Heading eyebrow={t("Notices")} title={t("Notice board")}><a className="btn outline" href="/notices">{t("All notices")} <Icon name="arrow" size={14} /></a></Heading>
              <div className="site-notice-full">
                {data.notices.slice(0, 4).map((n) => (
                  <a key={n.id} href={`/notices/${n.id}`} className="site-card site-notice-row">
                    <span className="site-date-tile"><b>{date(n.date, { day: "numeric" })}</b><small>{date(n.date, { month: "short" })}</small></span>
                    <span className="site-notice-text"><b>{n.topic}</b><small>{t("No. {number}", { number: n.number })}</small></span>
                  </a>
                ))}
              </div>
            </div>
          )}
          {results.length > 0 && (
            <div>
              <Heading eyebrow={t("Results")} title={t("SSC results")} />
              <ResultsTable results={results} t={t} num={num} />
            </div>
          )}
        </section>
      )}

      {w.admissionOpen && (
        <section className="site-wrap">
          <div className="site-band">
            <Icon name="cap" size={56} />
            <h2>{admission}</h2>
            <p>{t("Give your child the best start for a bright tomorrow.")}{w.admissionDeadline && <> {t("Apply by {date}", { date: date(w.admissionDeadline) })}.</>}</p>
            <a className="btn gold" href="/admission">{t("Enquire now")} <Icon name="arrow" size={16} /></a>
          </div>
        </section>
      )}
    </>
  );
}

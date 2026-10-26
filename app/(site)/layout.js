import { currentUser } from "@/lib/server/session.js";
import { SiteNav, SiteLang } from "@/components/site/SiteNav.js";
import { sitePage, Icon, Crest } from "@/components/site/parts.js";
import { needsRti, needsCharter, officerOf, charterOf, calendarOf, downloadsOf, isLink } from "@/lib/school/website.js";

export const dynamic = "force-dynamic";

// The public school website: a green bar with the school's phone and email,
// the header with the crest and menu, the page, and a green footer with the
// school's details. Green and gold, with serif headings; always light.
export default async function SiteLayout({ children }) {
  const { lang, t, data, num } = await sitePage();
  const user = await currentUser();
  const w = data?.website ?? {};
  const school = data?.school ?? "Scholar";
  const items = [
    ["/", t("Home")], ["/about", t("About")], ["/academics", t("Academics")], ["/admission", t("Admission")],
    ...(w.showTeachers ? [["/teachers", t("Teachers")]] : []), ["/notices", t("Notices")],
    ["/gallery", t("Gallery")], ["/contact", t("Contact")],
  ];
  // The footer's Information column: what the school must or chooses to publish.
  const info = data ? [
    ...(needsRti(w) || officerOf(w.rtiOfficer) ? [["/rti", t("Right to Information")]] : []),
    ...(needsCharter(w) || charterOf(w).length ? [["/charter", t("Citizen's charter")]] : []),
    ["/calendar", t("Academic calendar")],
    ...(downloadsOf(w).length || isLink(w.admissionNotice) ? [["/downloads", t("Downloads")]] : []),
    ["/admission", t("Admission")], ["/notices", t("Notices")],
  ] : [];
  const phone = w.phone?.split(",")[0].trim();
  const [first, ...rest] = school.split(" ");
  return (
    <div className="site">
      <div className="site-top">
        <div className="site-wrap site-top-in">
          <div className="site-top-info">
            {phone && <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={13} />{phone}</a>}
            {w.email && <a href={`mailto:${w.email}`} className="hide-sm"><Icon name="mail" size={13} />{w.email}</a>}
            {w.address && <span className="hide-md"><Icon name="pin" size={13} />{w.address}</span>}
          </div>
          <div className="site-top-tools">
            {info[0]?.[0] === "/rti" && <a href="/rti" className="hide-md">{t("Right to Information")}</a>}
            <a href="/notices" className="hide-sm">{t("Notices")}</a>
            <a href={user ? "/app" : "/login"}>{user ? t("Open Scholar") : t("Sign in")}</a>
            <SiteLang lang={lang} />
            {w.admissionOpen && <a href="/admission" className="site-top-cta">{t("Admission is open")}</a>}
          </div>
        </div>
      </div>
      <header className="site-head">
        <div className="site-wrap site-head-in">
          <a href="/" className="site-brand">
            <Crest school={school} />
            <span className="site-brand-text"><b>{first}</b>{rest.length > 0 && <span>{rest.join(" ")}</span>}</span>
          </a>
          <SiteNav items={items} menuLabel={t("Open menu")} />
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-foot">
        <div className="site-wrap site-foot-in">
          <div className="site-foot-about">
            <a href="/" className="site-brand"><Crest school={school} size={44} /><span className="site-brand-text"><b>{first}</b>{rest.length > 0 && <span>{rest.join(" ")}</span>}</span></a>
            {w.tagline && <p>{w.tagline}</p>}
            <ul className="site-facts">
              {w.eiin && <li>{t("EIIN {eiin}", { eiin: w.eiin })}{w.schoolCode && ` · ${t("School code {code}", { code: w.schoolCode })}`}</li>}
              {w.board && <li>{t.data(w.board)}</li>}
            </ul>
            {w.facebook && <a className="site-social" href={w.facebook} rel="noopener" target="_blank" aria-label={t("Facebook page")}><Icon name="facebook" size={16} /></a>}
          </div>
          <div>
            <h4>{t("Quick links")}</h4>
            <ul>{items.map(([href, label]) => <li key={href}><a href={href}>{label}</a></li>)}</ul>
          </div>
          <div>
            <h4>{t("Information")}</h4>
            <ul>{info.map(([href, label]) => <li key={href}><a href={href}>{label}</a></li>)}</ul>
          </div>
          {(w.address || w.phone || w.email || w.officeHours) && <div>
            <h4>{t("Contact")}</h4>
            <ul className="site-contact">
              {w.address && <li><Icon name="pin" size={16} />{w.address}</li>}
              {w.phone && <li><Icon name="phone" size={16} /><span>{w.phone}</span></li>}
              {w.email && <li><Icon name="mail" size={16} /><a href={`mailto:${w.email}`}>{w.email}</a></li>}
              {w.officeHours && <li><Icon name="clock" size={16} />{w.officeHours}</li>}
            </ul>
          </div>}
        </div>
        <div className="site-foot-bottom">
          <div className="site-wrap site-foot-bottom-in">
            <span>© {num(new Date().getFullYear())} {school}</span>
            <a href="/login">{t("Sign in to Scholar")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

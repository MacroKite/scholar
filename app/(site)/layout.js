import { currentUser } from "@/lib/server/session.js";
import { SiteNav, SiteLang } from "@/components/site/SiteNav.js";
import { sitePage, Icon } from "@/components/site/parts.js";
import { galleryOf } from "@/lib/school/website.js";

export const dynamic = "force-dynamic";

// The public school website: a header with the menu, the page, and a footer
// with the school's details. Uses the classic look.
export default async function SiteLayout({ children }) {
  const { lang, t, data, num } = await sitePage();
  const user = await currentUser();
  const w = data?.website ?? {};
  const school = data?.school ?? "Scholar";
  const items = [
    ["/", t("Home")], ["/about", t("About")], ["/academics", t("Academics")], ["/admission", t("Admission")],
    ...(w.showTeachers ? [["/teachers", t("Teachers")]] : []), ["/notices", t("Notices")],
    ...(galleryOf(w).length ? [["/gallery", t("Gallery")]] : []), ["/contact", t("Contact")],
  ];
  return (
    <div className="site">
      <header className="site-head">
        <div className="site-wrap site-head-in">
          <a href="/" className="site-brand">
            <span className="brand-mark">{school.slice(0, 1)}</span>
            <span className="site-brand-text"><b>{school}</b>{w.eiin && <small>{t("EIIN {eiin}", { eiin: w.eiin })}</small>}</span>
          </a>
          <SiteNav items={items} menuLabel={t("Open menu")} />
          <div className="site-head-tools">
            <SiteLang lang={lang} />
            <a className="btn primary sm" href={user ? "/app" : "/login"}>{user ? t("Open Scholar") : t("Sign in")}</a>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-foot">
        <div className="site-wrap site-foot-in">
          <div>
            <div className="site-foot-name">{school}</div>
            {w.tagline && <p>{w.tagline}</p>}
            <ul className="site-facts">
              {w.eiin && <li>{t("EIIN {eiin}", { eiin: w.eiin })}</li>}
              {w.schoolCode && <li>{t("School code {code}", { code: w.schoolCode })}</li>}
              {w.established && <li>{t("Established {year}", { year: num(w.established) })}</li>}
              {w.board && <li>{t.data(w.board)}</li>}
            </ul>
          </div>
          <div>
            <h4>{t("Contact")}</h4>
            <ul className="site-contact">
              {w.address && <li><Icon name="pin" />{w.address}</li>}
              {w.phone && <li><Icon name="phone" /><span>{w.phone}</span></li>}
              {w.email && <li><Icon name="mail" /><a href={`mailto:${w.email}`}>{w.email}</a></li>}
              {w.officeHours && <li><Icon name="clock" />{w.officeHours}</li>}
            </ul>
          </div>
          <div>
            <h4>{t("Pages")}</h4>
            <ul className="site-links">
              {items.map(([href, label]) => <li key={href}><a href={href}>{label}</a></li>)}
              {w.facebook && <li><a href={w.facebook} rel="noopener" target="_blank">{t("Facebook page")}</a></li>}
            </ul>
          </div>
        </div>
        <div className="site-wrap site-foot-bottom">© {num(new Date().getFullYear())} {school} · <a href="/login">{t("Sign in to Scholar")}</a></div>
      </footer>
    </div>
  );
}

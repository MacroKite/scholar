"use client";

import { useEffect } from "react";
import { makeT } from "@/lib/i18n/index.js";

// The app shell. React renders the frame once; the pages inside it are drawn
// by lib/client/app.js, which takes over these elements after mount.
export default function ScholarApp({ initialState }) {
  useEffect(() => {
    import("@/lib/client/app.js").then((app) => app.start(initialState));
  }, [initialState]);

  const admin = initialState.role === "admin";
  // Labels render in the saved language; data-i18n lets app.js switch them later.
  const t = makeT(initialState.lang);
  const label = (key) => ({ "aria-label": t(key), title: t(key), "data-i18n-label": key });
  return (
    <>
      <div className="mobile-bar">
        <button className="icon-btn round" id="menuBtn" {...label("Open menu")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <div className="brand-mark">S</div>
        <span className="brand-name">Scholar</span>
      </div>

      <div className="app">
        <aside className="sidebar" id="sidebar">
          <div className="brand">
            <div className="brand-mark">S</div>
            <span className="brand-name">Scholar</span>
            <button type="button" className="lang-pill" id="langToggle">{t.lang === "bn" ? "EN" : "বাং"}</button>
            <button className="icon-btn round bell" id="bell" {...label("Notifications")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
              <span className="bell-badge" id="bellBadge" hidden></span>
            </button>
          </div>

          <div className="role-switch" id="roleSwitch"></div>

          <nav className="nav" id="nav"></nav>

          <div className="me" id="me">
            <div className="me-menu" id="meMenu" role="menu" hidden>
              <a href="#/settings" role="menuitem">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
                <span data-i18n="Settings">{t("Settings")}</span>
              </a>
              <button type="button" role="menuitem" data-action="logout">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
                <span data-i18n="Log out">{t("Log out")}</span>
              </button>
              {admin && (
                <button type="button" role="menuitem" data-action="reset-data" className="danger">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                  <span data-i18n="Reset demo data">{t("Reset demo data")}</span>
                </button>
              )}
            </div>
            <button className="me-trigger" id="meTrigger" aria-haspopup="menu" aria-expanded="false">
              <div className="avatar" id="meAvatar"></div>
              <div className="me-text">
                <div className="me-name" id="meName"></div>
                <div className="me-email" id="meSub"></div>
              </div>
            </button>
            <button className="icon-btn theme-btn" id="themeToggle" {...label("Toggle dark mode")}>
              <svg className="moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              <svg className="sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            </button>
          </div>
        </aside>
        <div className="scrim" id="scrim"></div>

        <main className="main" id="view"></main>
      </div>

      <div className="modal-backdrop" id="modal" hidden></div>
    </>
  );
}

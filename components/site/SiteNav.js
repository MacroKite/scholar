"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LANG_COOKIE } from "@/lib/i18n/index.js";

// The website's menu (with the open page marked) and its language switch.
// On phones the menu folds into a button.
export function SiteNav({ items, menuLabel }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const on = (href) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className={`site-menu ${open ? "open" : ""}`}>
      <button type="button" className="site-menu-btn" aria-label={menuLabel} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <nav className="site-nav">
        {items.map(([href, label]) => <a key={href} href={href} className={on(href) ? "on" : ""}>{label}</a>)}
      </nav>
    </div>
  );
}

export function SiteLang({ lang }) {
  const router = useRouter();
  const toggle = () => {
    const next = lang === "bn" ? "en" : "bn";
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <button type="button" className="lang-pill" onClick={toggle} title={lang === "bn" ? "Switch to English" : "বাংলায় দেখুন"}>
      {lang === "bn" ? "EN" : "বাং"}
    </button>
  );
}

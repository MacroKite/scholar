"use client";

import { useState } from "react";
import { LANG_COOKIE, makeT } from "@/lib/i18n/index.js";

// Language for the sign-in pages: starts from the cookie the server read,
// and the switch saves the new choice in the same cookie.
export function useLang(initial) {
  const [lang, setLang] = useState(initial);
  const t = makeT(lang);
  const toggle = () => {
    const next = lang === "bn" ? "en" : "bn";
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    setLang(next);
  };
  const switcher = (
    <button type="button" className="lang-pill login-lang" onClick={toggle} title={lang === "bn" ? "Switch to English" : "বাংলায় দেখুন"}>
      {lang === "bn" ? "English" : "বাংলা"}
    </button>
  );
  return { t, switcher };
}

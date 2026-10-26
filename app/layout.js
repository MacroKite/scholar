import Script from "next/script";
import "./globals.css";
import { currentLang } from "@/lib/server/session.js";

export const metadata = {
  title: "Scholar",
  description: "Academic management for schools: classes, timetable, attendance, exams, results and fees.",
};

// Apply the saved theme before first paint so there's no light/dark flash.
const THEME_SCRIPT = `try {
  var pref = localStorage.getItem("edulytics-theme") || "system";
  var dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
} catch (e) { document.documentElement.dataset.theme = "light"; }`;

export default async function RootLayout({ children }) {
  return (
    <html lang={await currentLang()} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Classic look: Inter, with Source Serif headings (Noto Serif Bengali in Bangla).
            Friendly look (students): Nunito. The public website: Playfair Display headings. Noto Sans Bengali for Bangla text throughout. */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+Bengali:wght@400;500;600;700&family=Noto+Serif+Bengali:wght@500;600;700&family=Nunito:wght@400;600;700;800&family=Playfair+Display:wght@600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        {/* beforeInteractive: Next puts it in the server HTML and runs it before hydration. */}
        <Script id="scholar-theme" strategy="beforeInteractive">{THEME_SCRIPT}</Script>
      </body>
    </html>
  );
}

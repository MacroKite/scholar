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
  document.documentElement.dataset.palette = localStorage.getItem("edulytics-palette") || "blue";
} catch (e) { document.documentElement.dataset.theme = "light"; }`;

export default async function RootLayout({ children }) {
  return (
    <html lang={await currentLang()} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Inter for Latin text; Noto Sans Bengali for Bangla. */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        {/* beforeInteractive: Next puts it in the server HTML and runs it before hydration. */}
        <Script id="scholar-theme" strategy="beforeInteractive">{THEME_SCRIPT}</Script>
      </body>
    </html>
  );
}

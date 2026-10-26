import { redirect } from "next/navigation";
import LoginForm from "./LoginForm.js";
import { one } from "@/lib/server/db.js";
import { DEMO_PASSWORD, usernameFor } from "@/lib/server/accounts.js";
import { currentLang, currentUser } from "@/lib/server/session.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Scholar" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/app");
  const st = await one(`SELECT s.school, s.admin_name, s.demo, t.name AS teacher, st.name AS student, st.guardian
                          FROM settings s LEFT JOIN teachers t ON t.id = s.demo->>'teacher' LEFT JOIN students st ON st.id = s.demo->>'student'`);
  // One account per role from the demo school, to try the app quickly.
  const demo = process.env.SHOW_DEMO_ACCOUNTS === "false" || !st ? null : [
    { role: "Admin", name: st.admin_name, username: usernameFor("admin") },
    st.teacher && { role: "Teacher", name: st.teacher, username: usernameFor("teacher", st.demo.teacher) },
    st.student && { role: "Student", name: st.student, username: usernameFor("student", st.demo.student) },
  ].filter(Boolean);
  return <LoginForm school={st?.school ?? "Scholar"} demo={demo} demoPassword={demo ? DEMO_PASSWORD : null} lang={await currentLang()} />;
}

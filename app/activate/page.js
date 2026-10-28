import { notFound, redirect } from "next/navigation";
import ActivateForm from "./ActivateForm.js";
import { forSchool } from "@/lib/server/db.js";
import { currentLang, currentSchool, currentUser } from "@/lib/server/session.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account · Scholar" };

export default async function ActivatePage({ searchParams }) {
  const school = await currentSchool();
  if (!school) notFound();
  if (await currentUser()) redirect("/app");
  const { u } = await searchParams;
  const st = await forSchool(school.id, (q) => q.one(`SELECT school FROM settings`));
  return <ActivateForm school={st?.school ?? "Scholar"} initialUsername={typeof u === "string" ? u.slice(0, 40) : ""} lang={await currentLang()} />;
}

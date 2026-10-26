import { redirect } from "next/navigation";
import ActivateForm from "./ActivateForm.js";
import { one } from "@/lib/server/db.js";
import { currentLang, currentUser } from "@/lib/server/session.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account · Scholar" };

export default async function ActivatePage({ searchParams }) {
  if (await currentUser()) redirect("/");
  const { u } = await searchParams;
  const st = await one(`SELECT school FROM settings WHERE id = 1`);
  return <ActivateForm school={st?.school ?? "Scholar"} initialUsername={typeof u === "string" ? u.slice(0, 40) : ""} lang={await currentLang()} />;
}

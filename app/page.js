import { redirect } from "next/navigation";
import ScholarApp from "@/components/ScholarApp.js";
import { buildState } from "@/lib/server/state.js";
import { currentLang, currentUser } from "@/lib/server/session.js";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <ScholarApp initialState={{ ...(await buildState(user)), lang: await currentLang() }} />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentViewer } from "../../../lib/api/viewer";
import { serverClient } from "../../../lib/storage/supabase";
import { recentImports } from "../../../lib/storage/imports";
import ImportSettings from "../../components/ImportSettings";

export const metadata: Metadata = { title: "Import" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login?next=/settings/import");

  const db = await serverClient();
  const history = db ? await recentImports(db, viewer.userId, 5) : [];

  return <ImportSettings history={history as never} />;
}

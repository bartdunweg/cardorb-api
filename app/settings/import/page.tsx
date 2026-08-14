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
  const [conn, history] = db
    ? await Promise.all([
        db.from("connections").select("database_id,last_import_at,last_error").eq("kind", "notion").maybeSingle(),
        recentImports(db, 5),
      ])
    : [{ data: null }, []];

  return (
    <ImportSettings
      connection={(conn as { data: unknown }).data as never}
      history={history as never}
    />
  );
}

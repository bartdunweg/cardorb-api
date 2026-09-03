import { NextResponse } from "next/server";
import { currentViewer } from "@/lib/api/viewer";
import { refuse } from "@/lib/api/respond";
import { readHeaders } from "@/lib/api/guard";
import { serverClient } from "@/lib/storage/supabase";
import { recentImports } from "@/lib/storage/imports";

/** What happened, each time somebody pressed the button. */
export async function GET(req: Request) {
  const viewer = await currentViewer();
  if (!viewer) return refuse("signIn", { headers: readHeaders(req) });

  const db = await serverClient();
  if (!db) return refuse("noDatabase", { headers: readHeaders(req) });

  return NextResponse.json(
    { imports: await recentImports(db, viewer.userId) },
    { headers: readHeaders(req) },
  );
}

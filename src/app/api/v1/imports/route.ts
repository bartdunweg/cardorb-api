import { NextResponse } from "next/server";
import { currentViewer } from "@/lib/api/viewer";
import { refuse } from "@/lib/api/respond";
import { serverClient } from "@/lib/storage/supabase";
import { recentImports } from "@/lib/storage/imports";

/** What happened, each time somebody pressed the button. */
export async function GET() {
  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const db = await serverClient();
  if (!db) return refuse("noDatabase");

  return NextResponse.json({ imports: await recentImports(db, viewer.userId) });
}

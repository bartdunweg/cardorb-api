import { NextResponse } from "next/server";
import { currentViewer } from "@/lib/api/viewer";
import { refuse, apiError } from "@/lib/api/respond";
import { serverClient } from "@/lib/storage/supabase";
import { recentImports } from "@/lib/storage/imports";

/** What happened, each time somebody pressed the button. */
export async function GET() {
  const viewer = await currentViewer();
  if (!viewer) return apiError(401, "Sign in first.");

  const db = await serverClient();
  if (!db) return refuse("noDatabase");

  return NextResponse.json({ imports: await recentImports(db, viewer.userId) });
}

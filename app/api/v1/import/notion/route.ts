import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { sameOrigin } from "../../../../../lib/api/guard";
import { currentViewer } from "../../../../../lib/api/viewer";
import { serverClient } from "../../../../../lib/storage/supabase";
import { open } from "../../../../../lib/storage/secrets";
import { listRows } from "../../../../../lib/storage/notion";
import { cardsTag } from "../../../../../lib/core/collection-row";
import { commit, preview } from "../../../../../lib/storage/imports";

/**
 * The connected Notion database, previewed or imported.
 *
 * Idempotent, and that is the whole design rather than a nicety. Every row
 * carries its Notion page id as source_id, and the unique index on
 * (user_id, source, source_id) means a second run adds only what is new. Press
 * it again next month and the new pages arrive; press it twice by accident and
 * nothing happens. That is ninety per cent of a sync for ten per cent of the
 * machinery, and it is honest about what it does — which "sync" would not be,
 * since Notion has no change feed to build one on.
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let doCommit = false;
  try {
    const body = (await req.json().catch(() => ({}))) as { commit?: unknown };
    doCommit = body.commit === true;
  } catch {
    /* an empty body is a preview */
  }

  const db = await serverClient();
  if (!db) {
    return NextResponse.json({ error: "This deployment has no database configured." }, { status: 503 });
  }

  const { data: conn } = await db
    .from("connections")
    .select("secret,database_id")
    .eq("kind", "notion")
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ error: "No Notion database is connected." }, { status: 404 });
  }

  const { secret, database_id } = conn as { secret: string; database_id: string };

  let rows;
  try {
    rows = await listRows(open(secret), database_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Reading Notion failed:", message);
    // Recorded on the connection, so the settings screen can say something
    // more useful than "connected" — which is what that column is for.
    await db.from("connections").update({ last_error: message }).eq("kind", "notion");
    return NextResponse.json(
      { error: "Notion could not be read. The token may have been revoked." },
      { status: 502 },
    );
  }

  if (!doCommit) return NextResponse.json(preview(rows, 0));

  try {
    const outcome = await commit(db, viewer.userId, "notion", rows, 0);
    await db
      .from("connections")
      .update({ last_import_at: new Date().toISOString(), last_error: null })
      .eq("kind", "notion");
    revalidateTag(cardsTag(viewer.userId), { expire: 0 });
    return NextResponse.json(outcome);
  } catch (err) {
    console.error("Notion import failed:", err);
    return NextResponse.json({ error: "That import could not be finished." }, { status: 500 });
  }
}

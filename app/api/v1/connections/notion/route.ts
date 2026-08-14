import { NextResponse } from "next/server";
import { sameOrigin } from "../../../../../lib/api/guard";
import { currentViewer } from "../../../../../lib/api/viewer";
import { serverClient } from "../../../../../lib/storage/supabase";
import { seal, sealingAvailable } from "../../../../../lib/storage/secrets";
import { listRows } from "../../../../../lib/storage/notion";

/**
 * Somebody else's Notion database, connected.
 *
 * The token is proved before it is stored. A connection that is saved and then
 * fails on first use is a support conversation; one that refuses to save
 * because the token cannot read the database is an error message next to the
 * field that caused it. So this actually queries, and only seals a credential
 * it has watched work.
 *
 * lib/storage/notion.ts has been parameterised on (token, databaseId) since the
 * storage seam went in — the same pair this table stores — so there is nothing
 * to adapt. That was written before there was a connections table, in the hope
 * that it would be this easy.
 */
const NOTION_ID = /[0-9a-f]{32}|[0-9a-f-]{36}/i;

/** A Notion URL carries the database id; people paste the URL. */
function databaseIdFrom(input: string): string | null {
  const match = input.match(NOTION_ID);
  if (!match) return null;
  const raw = match[0].replace(/-/g, "");
  if (raw.length !== 32) return null;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  if (!sealingAvailable()) {
    console.error("SECRETS_KEY is not set: a connection cannot be stored");
    return NextResponse.json(
      { error: "This deployment cannot store a connection." },
      { status: 503 },
    );
  }

  let token = "";
  let database = "";
  try {
    const body = (await req.json()) as { token?: unknown; database?: unknown };
    if (typeof body.token === "string") token = body.token.trim();
    if (typeof body.database === "string") database = body.database.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!token) return NextResponse.json({ error: "Paste your integration token." }, { status: 400 });

  const databaseId = databaseIdFrom(database);
  if (!databaseId) {
    return NextResponse.json(
      { error: "That does not look like a Notion database link or id." },
      { status: 400 },
    );
  }

  // Proved, not assumed.
  try {
    await listRows(token, databaseId);
  } catch (err) {
    console.error("Notion connection check failed:", err);
    return NextResponse.json(
      {
        error:
          "Notion refused that. Check the token, and that the database is shared with the integration.",
      },
      { status: 400 },
    );
  }

  const db = await serverClient();
  if (!db) {
    return NextResponse.json({ error: "This deployment has no database configured." }, { status: 503 });
  }

  const { error } = await db.from("connections").upsert(
    { kind: "notion", secret: seal(token), database_id: databaseId, last_error: null },
    { onConflict: "user_id,kind" },
  );

  if (error) {
    console.error("Saving a connection failed:", error.message);
    return NextResponse.json({ error: "That connection could not be saved." }, { status: 500 });
  }

  // Never the token back, not even the sealed one.
  return NextResponse.json({ ok: true, databaseId });
}

export async function DELETE() {
  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const db = await serverClient();
  if (!db) return NextResponse.json({ error: "No database configured." }, { status: 503 });

  const { error } = await db.from("connections").delete().eq("kind", "notion");
  if (error) return NextResponse.json({ error: "That could not be removed." }, { status: 500 });

  // The cards it imported stay. They are the person's collection now, and
  // deleting them because a connection went away would be reading "disconnect"
  // as "undo everything I ever brought in".
  return NextResponse.json({ ok: true });
}

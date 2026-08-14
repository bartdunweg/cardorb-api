import { NextResponse } from "next/server";
import { authorise, readHeaders, refused } from "../../../../lib/api/guard";
import { validateUsername } from "../../../../lib/core/account";
import { adminClient } from "../../../../lib/storage/supabase";

type ProfilePatch = { username?: unknown; displayName?: unknown; isPublic?: unknown };

export async function GET(req: Request) {
  const viewer = await authorise(req);
  if (refused(viewer))
    return NextResponse.json({ error: viewer.error }, { status: viewer.status, headers: readHeaders(req) });

  const db = adminClient();
  if (!db) return NextResponse.json({ error: "Profiles are not configured." }, { status: 503 });
  const { data, error } = await db
    .from("profiles")
    .select("username,display_name,is_public")
    .eq("id", viewer.userId)
    .single();
  if (error) return NextResponse.json({ error: "Profile unavailable." }, { status: 502 });
  return NextResponse.json(
    { username: data.username, displayName: data.display_name, isPublic: data.is_public },
    { headers: readHeaders(req) },
  );
}

export async function PATCH(req: Request) {
  const viewer = await authorise(req);
  if (refused(viewer))
    return NextResponse.json({ error: viewer.error }, { status: viewer.status, headers: readHeaders(req) });

  let body: ProfilePatch;
  try {
    body = (await req.json()) as ProfilePatch;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: readHeaders(req) });
  }

  const patch: Record<string, string | boolean | null> = {};
  if (typeof body.username === "string") {
    const username = body.username.trim().toLowerCase();
    const valid = validateUsername(username);
    if (!valid.ok)
      return NextResponse.json({ error: valid.error }, { status: 400, headers: readHeaders(req) });
    patch.username = username;
  }
  if (typeof body.displayName === "string") {
    const displayName = body.displayName.trim();
    if (displayName.length > 60)
      return NextResponse.json({ error: "That display name is too long." }, { status: 400, headers: readHeaders(req) });
    patch.display_name = displayName || null;
  }
  if (typeof body.isPublic === "boolean") patch.is_public = body.isPublic;
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "Nothing to update." }, { status: 400, headers: readHeaders(req) });

  const db = adminClient();
  if (!db) return NextResponse.json({ error: "Profiles are not configured." }, { status: 503 });
  const { data, error } = await db
    .from("profiles")
    .update(patch)
    .eq("id", viewer.userId)
    .select("username,display_name,is_public")
    .single();
  if (error) {
    const status = /duplicate|unique/i.test(error.message) ? 409 : 502;
    return NextResponse.json({ error: status === 409 ? "That name is taken." : "Profile unavailable." }, { status, headers: readHeaders(req) });
  }
  return NextResponse.json(
    { username: data.username, displayName: data.display_name, isPublic: data.is_public },
    { headers: readHeaders(req) },
  );
}

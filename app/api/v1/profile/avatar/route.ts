import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sameOrigin } from "../../../../../lib/api/guard";
import { bearer, requestViewer } from "../../../../../lib/api/viewer";
import { serverClient, userClient } from "../../../../../lib/storage/supabase";
import { updateProfile } from "../../../../../lib/storage/postgres";

/**
 * A profile picture, uploaded.
 *
 * The body is a data URL (`data:image/png;base64,...`) rather than
 * multipart/form-data: every other client-to-server call in this app is
 * `fetch(url, { body: JSON.stringify(...) })` (see ImportSettings.tsx's CSV
 * upload, which reads the file as text for the same reason) and this keeps
 * that the one convention instead of adding a second one for images alone.
 * The tradeoff is the ~33% base64 overhead, acceptable for an avatar-sized
 * image capped below.
 *
 * One object per account, named by the account's own id
 * (`<userId>/avatar.<ext>`) with `upsert: true` — re-uploading replaces it
 * rather than accumulating orphaned files nothing ever points at or deletes.
 */

const MAX_BYTES = 2 * 1024 * 1024; // 2MB decoded — an avatar, not a scan.
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewer = await requestViewer(req);
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { image?: unknown };
  try {
    body = (await req.json()) as { image?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof body.image !== "string") {
    return NextResponse.json({ error: "No image sent." }, { status: 400 });
  }

  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(body.image);
  if (!match) {
    return NextResponse.json({ error: "That is not a PNG, JPEG or WebP image." }, { status: 400 });
  }
  const [, mime, base64] = match;
  const ext = MIME_TO_EXT[mime!]!;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64!, "base64");
  } catch {
    return NextResponse.json({ error: "That image could not be read." }, { status: 400 });
  }
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "Images up to 2MB only." }, { status: 400 });
  }

  const token = bearer(req);
  const db = token ? userClient(token) : await serverClient();
  if (!db) {
    return NextResponse.json({ error: "This deployment has no database configured." }, { status: 503 });
  }

  const path = `${viewer.userId}/avatar.${ext}`;
  const { error: uploadError } = await db.storage
    .from("avatars")
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (uploadError) {
    console.error("Uploading an avatar failed:", uploadError);
    return NextResponse.json({ error: "That image could not be saved." }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = db.storage.from("avatars").getPublicUrl(path);
  // A fresh upload at the same path is a new file, and browsers/CDNs cache the
  // old one by URL alone — a query string forces both to fetch the one just
  // written instead of showing yesterday's picture back.
  const avatarUrl = `${publicUrl}?v=${Date.now()}`;

  try {
    await updateProfile(db, viewer.userId, { avatarUrl });
  } catch (err) {
    console.error("Saving the avatar URL failed:", err);
    return NextResponse.json({ error: "That change could not be saved." }, { status: 500 });
  }

  revalidatePath(`/user/${viewer.username}`);

  return NextResponse.json({ ok: true, avatarUrl });
}

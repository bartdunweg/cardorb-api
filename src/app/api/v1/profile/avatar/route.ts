import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sameOrigin } from "@/lib/api/guard";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { bearer, requestViewer } from "@/lib/api/viewer";
import { serverClient, userClient } from "@/lib/storage/supabase";
import { updateProfile } from "@/lib/storage/postgres";

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

/**
 * Do the first bytes agree with the declared type?
 *
 * Three signatures, one per entry in MIME_TO_EXT above. PNG and JPEG are fixed
 * byte sequences; WebP is a RIFF container, so the check is the two four-byte
 * tags with the file length between them.
 *
 * Deliberately not a decode: this is a cheap "is it plausibly what it claims"
 * that stops a text file, a script or an SVG being stored as image/png, not a
 * guarantee that the pixels are valid. A malformed PNG is the browser's problem
 * and always was.
 */
function looksLike(mime: string, bytes: Buffer): boolean {
  if (mime === "image/png") {
    return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  }
  if (mime === "image/jpeg") {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/webp") {
    return (
      bytes.length > 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

/**
 * Thirty uploads per account per fifteen minutes.
 *
 * Keyed on the account rather than the address, like the CSV import: the cost
 * is Storage operations and bandwidth, which belong to a user. `upsert: true`
 * at a fixed path means nothing accumulates, so this is spend rather than
 * growth — but it was unthrottled, and it is a 2 MB body.
 *
 * Generous on purpose. Someone cropping a picture until they like it is the
 * normal case and should never meet this.
 */
const byAccount = createRateLimiter(15 * 60_000, 30);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewer = await requestViewer(req);
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  if (byAccount(viewer.userId)) {
    return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  }

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

  // The `data:` prefix is a claim by the caller, not a fact about the bytes, and
  // until here it was the only thing deciding what got stored and under which
  // Content-Type. The bucket is public (see the migration), so what lands in it
  // is served to anyone with the URL — arbitrary bytes labelled image/png.
  // Checking the signature is what turns the caller's claim into a fact.
  if (!looksLike(mime!, bytes)) {
    return NextResponse.json(
      { error: "That file is not the kind of image it says it is." },
      { status: 400 },
    );
  }

  const token = bearer(req);
  const db = token ? userClient(token) : await serverClient();
  if (!db) {
    return NextResponse.json(
      { error: "This deployment has no database configured." },
      { status: 503 },
    );
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

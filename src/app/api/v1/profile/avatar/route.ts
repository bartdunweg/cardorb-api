import { NextResponse } from "next/server";
import { readJsonBody, BODY_LIMIT } from "@/lib/api/body";
import { refuse, apiError, retryAfter } from "@/lib/api/respond";
import { sameOrigin } from "@/lib/api/guard";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { bearer, forgetProfile, requestViewer } from "@/lib/api/viewer";
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
  if (!sameOrigin(req)) return apiError(403, "Forbidden");

  const viewer = await requestViewer(req);
  if (!viewer) return refuse("signIn");

  const wait = byAccount(viewer.userId);
  if (wait) {
    return apiError(429, "Too many uploads. Try again shortly.", undefined, {
      headers: retryAfter(wait),
    });
  }

  const read = await readJsonBody<{ image?: unknown }>(req, BODY_LIMIT.avatar);
  if (read.kind === "too-large") return apiError(413, "That image is too large.");
  if (read.kind === "invalid") return apiError(400, "Invalid request");
  const body = read.body;

  if (typeof body.image !== "string") {
    return apiError(400, "No image sent.");
  }

  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(body.image);
  if (!match) {
    return apiError(400, "That is not a PNG, JPEG or WebP image.");
  }
  const [, mime, base64] = match;
  const ext = MIME_TO_EXT[mime!]!;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64!, "base64");
  } catch {
    return apiError(400, "That image could not be read.");
  }
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return apiError(400, "Images up to 2MB only.");
  }

  // The `data:` prefix is a claim by the caller, not a fact about the bytes, and
  // until here it was the only thing deciding what got stored and under which
  // Content-Type. The bucket is public (see the migration), so what lands in it
  // is served to anyone with the URL — arbitrary bytes labelled image/png.
  // Checking the signature is what turns the caller's claim into a fact.
  if (!looksLike(mime!, bytes)) {
    return apiError(400, "That file is not the kind of image it says it is.");
  }

  const token = bearer(req);
  const db = token ? userClient(token) : await serverClient();
  if (!db) {
    return refuse("noDatabase");
  }

  const path = `${viewer.userId}/avatar.${ext}`;
  const { error: uploadError } = await db.storage
    .from("avatars")
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (uploadError) {
    console.error("Uploading an avatar failed:", uploadError);
    return apiError(500, "That image could not be saved.");
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
    forgetProfile(viewer.userId);
  } catch (err) {
    console.error("Saving the avatar URL failed:", err);
    return apiError(500, "That change could not be saved.");
  }

  return NextResponse.json({ ok: true, avatarUrl });
}

/**
 * Removing the avatar again.
 *
 * Nulling the profile's `avatarUrl` is the part that matters — that column is
 * what the UI and the public page read. The stored object is removed too so its
 * public URL stops answering, but the extension it was saved under is not known
 * here, so all three candidates are removed and the ones that do not exist are a
 * no-op. Storage failure is not fatal: an orphaned object nobody points at is
 * better than a delete that refuses because a file was already gone.
 */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Forbidden");

  const viewer = await requestViewer(req);
  if (!viewer) return refuse("signIn");

  const token = bearer(req);
  const db = token ? userClient(token) : await serverClient();
  if (!db) {
    return refuse("noDatabase");
  }

  await db.storage
    .from("avatars")
    .remove(Object.values(MIME_TO_EXT).map((ext) => `${viewer.userId}/avatar.${ext}`))
    .catch(() => {});

  try {
    await updateProfile(db, viewer.userId, { avatarUrl: null });
    forgetProfile(viewer.userId);
  } catch (err) {
    console.error("Clearing the avatar failed:", err);
    return apiError(500, "That change could not be saved.");
  }

  return NextResponse.json({ ok: true });
}

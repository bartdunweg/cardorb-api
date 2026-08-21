import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sameOrigin } from "../../../../lib/api/guard";
import { bearer, requestViewer } from "../../../../lib/api/viewer";
import { serverClient, userClient } from "../../../../lib/storage/supabase";
import { ownProfile, updateProfile } from "../../../../lib/storage/postgres";
import { MAX_DISPLAY_NAME } from "../../../../lib/core/account";

/**
 * The things about a profile its owner may change.
 *
 * is_public is the one that matters. It defaults to false — the migration
 * argues that sharing "is something you do, not something that happens to you"
 * — and until this route existed nothing could set it, which meant
 * /user/<name> was unreachable for every account whose row had not been edited
 * by hand. One switch turns on a feature that was already entirely built: the
 * profile lookup, stripPrices, the OG image, the JSON-LD.
 *
 * PATCH rather than PUT: a body that mentions one field must not clear the
 * others. The screen has controls that save independently, and the welcome
 * flow (components/custom/Onboarding.tsx) saves each of its steps on its own for
 * the same reason.
 *
 * requestViewer() rather than currentViewer(): the latter only ever reads a
 * cookie, which the iOS app never carries, so this route refused every
 * bearer-token caller regardless of how good their token was. sameOrigin()
 * already passes a request with no Origin header, i.e. curl and the app, so
 * the only thing standing between iOS and its own settings screen was this
 * one cookie-only lookup.
 */
export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewer = await requestViewer(req);
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const patch: { displayName?: string | null; isPublic?: boolean; onboardedAt?: string } = {};

  if ("displayName" in body) {
    const raw = typeof body.displayName === "string" ? body.displayName.trim() : "";
    // Emptied means "use my username", which is a null in the column rather
    // than an empty string: the public page falls back on null, and "" would
    // render as a heading with nothing in it.
    if (raw.length > MAX_DISPLAY_NAME) {
      return NextResponse.json({ error: "That name is too long." }, { status: 400 });
    }
    patch.displayName = raw || null;
  }

  if ("isPublic" in body) {
    if (typeof body.isPublic !== "boolean") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    patch.isPublic = body.isPublic;
  }

  // One way only. `onboarded: true` stamps the clock; nothing else is
  // accepted, so no body — stray, replayed or hostile — can put an account
  // back in front of the welcome flow, and the timestamp of the first time
  // through survives every later PATCH.
  if (body.onboarded === true) {
    patch.onboardedAt = new Date().toISOString();
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  // A token if the caller sent one, cookies otherwise — the same rule as
  // every Postgres write below the accounts migration, and for the same
  // reason: profiles_write is `using (id = auth.uid())`, and auth.uid() comes
  // from whichever connection actually asks.
  const token = bearer(req);
  const db = token ? userClient(token) : await serverClient();
  if (!db) {
    return NextResponse.json(
      { error: "This deployment has no database configured." },
      { status: 503 },
    );
  }

  try {
    await updateProfile(db, viewer.userId, patch);
  } catch (err) {
    console.error("Updating a profile failed:", err);
    return NextResponse.json({ error: "That change could not be saved." }, { status: 500 });
  }

  // The public page is dynamic, so there is no ISR entry to drop — but it is
  // rendered from a profile lookup that Next may still be holding for this
  // request tree, and a visitor who just turned sharing off should not be able
  // to refresh into their own cached page. Cheap, and it removes a class of
  // "it says it is private but it is still there".
  revalidatePath(`/user/${viewer.username}`);

  return NextResponse.json({ ok: true, ...patch });
}

/** What the settings screen renders from. */
export async function GET(req: Request) {
  const viewer = await requestViewer(req);
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const token = bearer(req);
  const db = token ? userClient(token) : await serverClient();
  if (!db) {
    return NextResponse.json(
      { error: "This deployment has no database configured." },
      { status: 503 },
    );
  }

  const profile = await ownProfile(db, viewer.userId);
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  return NextResponse.json({ ...profile, email: viewer.email });
}

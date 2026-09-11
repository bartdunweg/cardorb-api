import { type PokedexSetting, validatePokedexSetting } from "@/lib/core/collection/folders";
import { NextResponse } from "next/server";
import { readJsonBody, BODY_LIMIT } from "@/lib/api/body";
import { refuse, apiError } from "@/lib/api/respond";
import { readHeaders, sameOrigin, storeErrorResponse } from "@/lib/api/guard";
import { bearer, requestViewer } from "@/lib/api/viewer";
import { serverClient, userClient } from "@/lib/storage/supabase";
import { ownProfile, updateProfile } from "@/lib/storage/postgres";
import { MAX_DISPLAY_NAME } from "@/lib/core/account/account";
import { forgetOnTheWeb } from "@/lib/api/web-cache";

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
 * flow (src/app/welcome/_components/Onboarding.tsx) saves each of its steps on its own for
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
  if (!sameOrigin(req)) return apiError(403, "Forbidden");

  const viewer = await requestViewer(req);
  if (!viewer) return refuse("signIn");

  const read = await readJsonBody<Record<string, unknown>>(req, BODY_LIMIT.profile);
  if (read.kind === "too-large") return apiError(413, "Payload too large");
  if (read.kind === "invalid") return apiError(400, "Invalid request");
  const body = read.body;

  const patch: {
    displayName?: string | null;
    isPublic?: boolean;
    wishlistPublic?: boolean;
    favoritesPublic?: boolean;
    pokedexPublic?: boolean;
    onboardedAt?: string;
    pokedex?: PokedexSetting | null;
  } = {};

  if ("displayName" in body) {
    const raw = typeof body.displayName === "string" ? body.displayName.trim() : "";
    // Emptied means "use my username", which is a null in the column rather
    // than an empty string: the public page falls back on null, and "" would
    // render as a heading with nothing in it.
    if (raw.length > MAX_DISPLAY_NAME) {
      return apiError(400, "That name is too long.");
    }
    patch.displayName = raw || null;
  }

  if ("isPublic" in body) {
    if (typeof body.isPublic !== "boolean") {
      return apiError(400, "Invalid request");
    }
    patch.isPublic = body.isPublic;
  }

  // The three lists beside the collection, each its own flag on the public page.
  for (const key of ["wishlistPublic", "favoritesPublic", "pokedexPublic"] as const) {
    if (key in body) {
      if (typeof body[key] !== "boolean") {
        return apiError(400, "Invalid request");
      }
      patch[key] = body[key];
    }
  }

  // One way only. `onboarded: true` stamps the clock; nothing else is
  // accepted, so no body — stray, replayed or hostile — can put an account
  // back in front of the welcome flow, and the timestamp of the first time
  // through survives every later PATCH.
  if (body.onboarded === true) {
    patch.onboardedAt = new Date().toISOString();
  }

  // How the built-in Pokédex shows: null is the default, every slot with the missing ones.
  if ("pokedex" in body) {
    if (body.pokedex === null) patch.pokedex = null;
    else {
      const setting = validatePokedexSetting(body.pokedex);
      if (setting.kind === "invalid") return apiError(400, setting.error);
      patch.pokedex = setting.setting;
    }
  }

  if (!Object.keys(patch).length) {
    return apiError(400, "Nothing to change.");
  }

  // A token if the caller sent one, cookies otherwise — the same rule as
  // every Postgres write below the accounts migration, and for the same
  // reason: profiles_write is `using (id = auth.uid())`, and auth.uid() comes
  // from whichever connection actually asks.
  const token = bearer(req);
  const db = token ? userClient(token) : await serverClient();
  if (!db) {
    return refuse("noDatabase");
  }

  try {
    await updateProfile(db, viewer.userId, patch);
  } catch (err) {
    console.error("Updating a profile failed:", err);
    return apiError(500, "That change could not be saved.");
  }

  // Nothing of this host's to purge: what it serves for a profile — the four
  // routes under /v1/public/<name>/ — are dynamic handlers cached only at the
  // CDN by their own header (PUBLIC_READ_CACHE), and a profile turned private
  // is gone from every edge within a minute. The web app keeps its own copy
  // for five minutes and is told, so a switch made in the iOS app is not
  // open on cardorb.com for the rest of them (cardorb-web, /api/revalidate).
  await forgetOnTheWeb({ userId: viewer.userId, username: viewer.username });

  return NextResponse.json({ ok: true, ...patch });
}

/** What the settings screen renders from. */
export async function GET(req: Request) {
  // readHeaders() on every answer, as on every other keyed read: without the
  // CORS pair a browser on an allowed origin cannot read the 401 or the 503,
  // and without `private, no-store` a shared cache could keep the profile.
  const headers = readHeaders(req);
  const viewer = await requestViewer(req);
  if (!viewer) return refuse("signIn", { headers });

  const token = bearer(req);
  const db = token ? userClient(token) : await serverClient();
  if (!db) {
    return refuse("noDatabase", { headers });
  }

  // Wrapped, like every other store read behind a route here. Unwrapped this
  // rejected out of the handler and Next wrote its own 500: a status the
  // contract does not carry, in a body that is not `{ error: string }` — the
  // one shape both clients branch on.
  let profile;
  try {
    profile = await ownProfile(db, viewer.userId);
  } catch (err) {
    return storeErrorResponse(err, req, "Reading the profile failed");
  }
  if (!profile) return apiError(404, "No profile.", undefined, { headers });

  return NextResponse.json({ ...profile, email: viewer.email }, { headers });
}

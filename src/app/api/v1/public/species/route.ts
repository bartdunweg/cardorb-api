import { NextResponse } from "next/server";
import { refuse, retryAfter } from "@/lib/api/respond";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { speciesList } from "@/lib/core/collection/pokedex";

export const dynamic = "force-dynamic";

/**
 * Every National Pokédex slot's number and name, and nothing else.
 *
 * `GET /v1/pokedex` carries the same two fields, but it carries them next to
 * how many cards the caller owns, so it asks for a key and keeps doing so. A
 * public profile's Pokédex tab needs the labels and not the counts: without
 * this route the web app had to call the authorised one to write "Bulbasaur"
 * under a slot, and a signed-out visitor got a 401 and an empty grid on a
 * profile whose owner had asked for it to be seen.
 *
 * The one public route with no username in its path, because there is no
 * person in the answer. It is the species list the catalogues agree on, the
 * same bytes for everyone.
 *
 * Each entry carries the URL of the species' official artwork, served by this
 * API itself: a Pokédex draws it in the slot it holds no card of, so the slot
 * says which Pokémon is missing and not only that one is.
 */

/**
 * The public routes never go through authorise(), so this is the only throttle
 * in front of them. Sixty a minute per address, as its siblings use; behind the
 * cache below almost nothing should reach the function at all.
 */
const byAddress = createRateLimiter(60_000, 60);

const addressOf = (req: Request) =>
  // x-real-ip first: x-forwarded-for is client-spoofable. Same order as guard.ts.
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

/**
 * Not PUBLIC_READ_CACHE, and not `private, no-store` either.
 *
 * The sixty seconds its siblings use is a privacy window: it bounds how long a
 * collection stays visible after its owner made the profile private. There is
 * nothing here to make private — no caller, no collection, no profile — and the
 * list only changes when a new generation is published and a deploy regenerates
 * pokedex.generated.json. So it is cached for real: an hour in the browser, a
 * day at the CDN, and a week of serving stale while it refreshes. A stale answer
 * costs a visitor the newest species' name and nothing more.
 */
const SPECIES_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export function GET(req: Request) {
  const wait = byAddress(addressOf(req));
  if (wait) return refuse("tooMany", { headers: retryAfter(wait) });

  return NextResponse.json(
    { entries: speciesList(new URL(req.url).origin) },
    { headers: { "Cache-Control": SPECIES_CACHE } },
  );
}

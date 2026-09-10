import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { getCardDetail } from "@/lib/core/collection/cards";
import { westernLanguagesOf } from "@/lib/core/catalogue/card-languages";
import { isBrowseLanguage } from "@/lib/core/catalogue/tcgdex-browse";
import { authorise, readHeaders, refused } from "@/lib/api/guard";

/**
 * One card, by the id TCGdex gives it ("sv03-125").
 *
 * That id rather than the row's own key, for the reason the key exists: it
 * carries the set name, spaces, ampersands and the dash it is split on, so it
 * is a fine map key and a terrible URL. Not every row has a tcgId, and a card
 * that never matched a catalogue has no detail to serve, which is a 404 rather
 * than an empty object: nothing is a different answer from nothing found.
 *
 * Behind the key, like every read here now. This one carries a price and the
 * raw Cardmarket figures it came from, which is exactly what the public page
 * goes out of its way not to show; leaving it open would be an easier way to
 * ask than reading the page it was hidden from.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ tcgId: string }> }) {
  // Authorised but not personalised: a card's detail is a fact about the card,
  // the same for everyone who asks. The check is here because this endpoint is
  // behind the door, not because the answer depends on who opened it.
  const who = await authorise(req);
  if (refused(who)) {
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  }

  const { tcgId } = await params;
  /* `?language=ja|zh-tw|zh-cn|ko`: that catalogue rather than the English one, because these
     ids are only in their own. Left out, English, which is every card this route has ever
     been asked about. */
  const language = new URL(req.url).searchParams.get("language");
  if (language && language !== "en" && !isBrowseLanguage(language))
    return apiError(400, "language must be en, ja, zh-tw, zh-cn or ko.", undefined, {
      headers: readHeaders(req),
    });
  const own = isBrowseLanguage(language) ? language : null;
  let card;
  let languages;
  try {
    // The printings beside the card: which Western catalogues carry this id.
    // None can, for a card from a catalogue of its own — the Western ones share
    // the English ids, so asking them would be six 404s to say so. Its own
    // language is the only one a copy of it can be.
    [card, languages] = await Promise.all([
      getCardDetail(tcgId, own),
      own ? Promise.resolve([]) : westernLanguagesOf(tcgId),
    ]);
  } catch (err) {
    // The catalogue did not answer. Not a 404: that would say the card is
    // gone, and a client may keep it.
    console.error(`Card ${tcgId} could not be read:`, err);
    return unavailable("That card could not be read. Try again in a moment.", readHeaders(req));
  }
  if (!card) {
    return apiError(404, "No such card.", undefined, { headers: readHeaders(req) });
  }
  // The hour of shared caching this used to carry is gone with the lock: a CDN
  // holding one person's answer and handing it to the next asker without a key
  // would undo the check above. getCardDetail memoises upstream, so what this
  // costs is the round trip, not the walk.
  return NextResponse.json({ ...card, languages }, { headers: readHeaders(req) });
}

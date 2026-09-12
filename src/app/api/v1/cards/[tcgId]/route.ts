import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { getCardDetail } from "@/lib/core/collection/cards";
import { usdToEurForRequest } from "@/lib/core/collection/collection";
import { languagesOf } from "@/lib/core/catalogue/card-languages";
import { raritiesOfEra } from "@/lib/core/catalogue/catalogue";
import { foilPatternsOfSerie } from "@/lib/core/catalogue/card-printings";
import { serieOfSet } from "@/lib/core/catalogue/era-rarities";
import { rarityOrNull } from "@/lib/core/collection/collection-row";
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
  /* `?language=ja`: the Japanese catalogue rather than the English one, because its ids are
     only in its own. Left out, English, which is every card this route has ever
     been asked about. */
  const language = new URL(req.url).searchParams.get("language");
  if (language && language !== "en" && !isBrowseLanguage(language))
    return apiError(400, "language must be en or ja.", undefined, {
      headers: readHeaders(req),
    });
  const own = isBrowseLanguage(language) ? language : null;
  let card;
  try {
    // The day's rate beside it: the price is TCGplayer's dollars, and a figure is only shown in
    // the currency the collection is valued in.
    card = await getCardDetail(tcgId, own, await usdToEurForRequest());
  } catch (err) {
    // The catalogue did not answer. Not a 404: that would say the card is
    // gone, and a client may keep it.
    console.error(`Card ${tcgId} could not be read:`, err);
    return unavailable("That card could not be read. Try again in a moment.", readHeaders(req));
  }
  if (!card) {
    return apiError(404, "No such card.", undefined, { headers: readHeaders(req) });
  }
  /* Both of these need the card in hand, so they are asked after it rather than beside it.
     `languages` is which Western printings exist, and the source that can answer depends on the
     set (languagesOf); none can for a card from a catalogue of its own, where its own language is
     the only one a copy can be. The era's rarities are asked for only where the catalogue has no
     rarity to give: those are the promos, the cards somebody has to name by hand, and a form that
     offers the era's own words cannot be used to write a word the era never had. */
  let languages;
  let eraRarities;
  let foilPatterns;
  try {
    [languages, eraRarities, foilPatterns] = await Promise.all([
      own ? Promise.resolve([]) : languagesOf(tcgId, card.set?.id ?? null),
      rarityOrNull(card.rarity) === null && card.set?.id
        ? raritiesOfEra(card.set.id)
        : Promise.resolve(null),
      /* `foilPatterns` is [] for a Wizards card, whose holo had its set's one foil, and null
         everywhere else (foilPatternsOfSerie). A set nobody can find is null: no answer. */
      own || !card.set?.id
        ? Promise.resolve(null)
        : serieOfSet(card.set.id).then(foilPatternsOfSerie, () => null),
    ]);
  } catch (err) {
    console.error(`The printings of ${tcgId} could not be read:`, err);
    return unavailable("That card could not be read. Try again in a moment.", readHeaders(req));
  }
  // The hour of shared caching this used to carry is gone with the lock: a CDN
  // holding one person's answer and handing it to the next asker without a key
  // would undo the check above. getCardDetail memoises upstream, so what this
  // costs is the round trip, not the walk.
  return NextResponse.json(
    { ...card, languages, eraRarities, foilPatterns },
    { headers: readHeaders(req) },
  );
}

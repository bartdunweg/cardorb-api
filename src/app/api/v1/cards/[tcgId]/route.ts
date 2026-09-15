import { catalogueCardId } from "@/lib/api/card-id";
import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { getCardDetail } from "@/lib/core/collection/cards";
import {
  detailFromSheet,
  languagesFromSheet,
  readCardSheet,
} from "@/lib/core/catalogue/card-sheet";
import {
  detailPrice,
  pricePatternPrints,
  usdToEurForRequest,
} from "@/lib/core/collection/collection";
import { languagesOf } from "@/lib/core/catalogue/card-languages";
import { foilPatternsOfSerie, patternPrintsFor } from "@/lib/core/catalogue/card-printings";
import { serieOfSet } from "@/lib/core/catalogue/tcgdex-client";
import { isBrowseLanguage } from "@/lib/core/catalogue/tcgdex-browse";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { withPrintPictures } from "@/lib/core/catalogue/print-pictures";
import { printPicturesOf } from "@/lib/storage/postgres";
import { adminClient } from "@/lib/storage/supabase";

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
 * product it came from, which is exactly what the public page
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

  const tcgId = catalogueCardId((await params).tcgId);
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
  let rate: number | null = null;
  /* The copy's sheet for the card, in the catalogue asked for: everything below out of our own
     store, and TCGdex asked only for a card the copy does not hold yet (card-sheet.ts). */
  const sheet = await readCardSheet(tcgId, own ?? "en");
  try {
    // The day's rate beside it: the price is TCGplayer's dollars, and a figure is only shown in
    // the currency the collection is valued in.
    rate = await usdToEurForRequest();
    card = sheet ? detailFromSheet(sheet, own ?? "en") : await getCardDetail(tcgId, own, rate);
    // The price every other surface shows for this printing (detailPrice), not the figure TCGdex
    // relays on the record, which runs behind and is missing for a Japanese card.
    if (card) card = await detailPrice(card, own, rate);
  } catch (err) {
    // The catalogue did not answer. Not a 404: that would say the card is
    // gone, and a client may keep it.
    console.error(`Card ${tcgId} could not be read:`, err);
    return unavailable("That card could not be read. Try again in a moment.", readHeaders(req));
  }
  if (!card) {
    return apiError(404, "No such card.", undefined, { headers: readHeaders(req) });
  }
  /* These need the card in hand, so they are asked after it rather than beside it.
     `languages` is which Western printings exist, and the source that can answer depends on the
     set (languagesOf); none can for a card from a catalogue of its own, where its own language is
     the only one a copy can be. The era's rarities that stood beside it went on 2026-09-15: they
     were offered for naming a promo's kind by hand, and a promo is a "Promo" now (promo-sets.ts). */
  let languages;
  let foilPatterns;
  let patternPrints;
  let pictures: Map<string, string> = new Map();
  try {
    [languages, foilPatterns, patternPrints, pictures] = await Promise.all([
      own
        ? Promise.resolve([])
        : sheet && languagesFromSheet(sheet)
          ? Promise.resolve(languagesFromSheet(sheet))
          : languagesOf(tcgId, card.set?.id ?? null),
      /* `foilPatterns` is [] for a Wizards card, whose holo had its set's one foil, and null
         everywhere else (foilPatternsOfSerie). A set nobody can find is null: no answer. */
      own || !card.set?.id
        ? Promise.resolve(null)
        : sheet?.set?.serie_id
          ? Promise.resolve(foilPatternsOfSerie(sheet.set.serie_id))
          : serieOfSet(card.set.id).then(foilPatternsOfSerie, () => null),
      /* `patternPrints`: the foil patterns TCGplayer sells this card in, each with its price, and
         whether a print without one exists. A form offers those and nothing else, so a card with
         none is not asked. English only: the pattern products are on the English shelf. */
      own ? Promise.resolve(null) : pricePatternPrints(patternPrintsFor(tcgId), rate),
      /* A picture per printing TCGplayer sells apart (print-pictures.ts): the Poké Ball reverse's
         own photo. No store, or one that will not answer, is no pictures: the card's scan stands. */
      (async () => {
        const db = adminClient();
        return db
          ? printPicturesOf(db, own ?? "en", card.id).catch((err) => {
              console.error(`The printings' pictures of ${tcgId} could not be read:`, err);
              return new Map<string, string>();
            })
          : new Map<string, string>();
      })(),
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
    {
      ...card,
      printings: withPrintPictures(card.printings, pictures),
      languages,
      foilPatterns,
      patternPrints: patternPrints
        ? { ...patternPrints, prints: withPrintPictures(patternPrints.prints, pictures) ?? [] }
        : patternPrints,
    },
    { headers: readHeaders(req) },
  );
}

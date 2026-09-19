import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { authorise, readHeaders, refused, storeErrorResponse } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import {
  ALL_READINGS,
  findFolder,
  getCollection,
  getMoverPrices,
} from "@/lib/core/collection/collection";
import { UUID } from "@/lib/core/collection/collection-row";
import { moversOf } from "@/lib/core/collection/movers";
import { agreedOn, type ItemFilter, narrowSets } from "@/lib/core/collection/items";
import { printedNumberOf } from "@/lib/core/catalogue/set-codes";
import { historyKey, priceLanguageOf } from "@/lib/core/price-months.mjs";

/**
 * The caller's cards whose price moved most over a period, up and down.
 *
 * Home draws it under the value line, over the same period the chart shows, so `days` is the
 * chart's periods: 7, 30, 91, 182, or `all`. 90 and 180 stay accepted for clients that still ask
 * for them; the web chart cuts three and six months at 91 and 182 days, and the movers under it
 * read the same window. Each card is compared between its earliest and its
 * latest reading in the window (moversOf), per copy at its own printing, and ranked by what the
 * move did to the collection: the change times the copies held. `top` is how many each way.
 *
 * `?folder=<id>`, `?folder=favorites` or `?folder=wishlist` answers for that list instead, read as
 * /v1/value-history reads it: favourite copies held, a binder's copies (a rule binder by its
 * rule), or the wished cards. The collection is cut to the list before the readings are asked
 * for, so only its cards are read. On the wishlist a card is priced at the printing wished and
 * counts as one copy, so `copies` is 1 and `total` is the change. A folder id that is not the
 * caller's is 404; anything else that is not one of the three is 400.
 *
 * 503 where the collection or the readings could not be read: an empty list means nothing moved,
 * and a store that is down is not that.
 */
export const dynamic = "force-dynamic";

const PERIODS = {
  "7": 7,
  "30": 30,
  "90": 90,
  "91": 91,
  "180": 180,
  "182": 182,
  all: null,
} as const;
const MAX_TOP = 10;

export async function GET(req: Request) {
  const viewer = await authorise(req);
  if (refused(viewer))
    return apiError(viewer.status, viewer.error, undefined, {
      headers: { ...readHeaders(req), ...viewer.headers },
    });

  const params = new URL(req.url).searchParams;
  const period = params.get("days") ?? "30";
  if (!(period in PERIODS))
    return apiError(400, "days must be 7, 30, 90, 91, 180, 182 or `all`.", undefined, {
      headers: readHeaders(req),
    });
  const topRaw = params.get("top");
  const top = topRaw === null ? 5 : Number(topRaw);
  if (!Number.isInteger(top) || top < 1 || top > MAX_TOP)
    return apiError(400, `top must be a whole number from 1 to ${MAX_TOP}.`, undefined, {
      headers: readHeaders(req),
    });

  const token = bearer(req) ?? undefined;
  const folder = params.get("folder");
  let filter: ItemFilter | null = null;
  if (folder) {
    if (folder !== "favorites" && folder !== "wishlist" && !UUID.test(folder))
      return apiError(400, "folder must be a folder id, `favorites` or `wishlist`.", undefined, {
        headers: readHeaders(req),
      });
    filter = folder === "wishlist" ? { owned: false } : { owned: true, favorite: true };
    if (folder !== "favorites" && folder !== "wishlist") {
      let found;
      try {
        found = await findFolder(viewer.userId, folder, token);
      } catch (err) {
        return storeErrorResponse(err, req, "Reading the folder failed");
      }
      if (!found)
        return apiError(404, "No folder by that id.", undefined, { headers: readHeaders(req) });
      filter = found.rule ? { rule: found.rule } : { owned: true, collection: folder };
    }
  }
  const wished = folder === "wishlist";
  const collection = await getCollection(viewer.userId, token);
  if (collection.failed)
    return apiError(503, "The collection is unavailable.", undefined, {
      headers: readHeaders(req),
    });
  // Cut to the list first, so the readings asked for are the list's cards and no others.
  const sets = filter ? narrowSets(collection.sets, filter) : collection.sets;
  // Each card by its id and its set's catalogue: the two catalogues share ids (neo4-106).
  const cards = [
    ...new Map(
      sets.flatMap((s) =>
        s.cards.flatMap((c) => {
          if (!c.tcgId) return [];
          const card = { tcgId: c.tcgId, language: priceLanguageOf(s.language) };
          return [[historyKey(card.language, card.tcgId), card] as const];
        }),
      ),
    ).values(),
  ];
  const days = PERIODS[period as keyof typeof PERIODS];
  const from =
    days === null
      ? ALL_READINGS
      : new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const prices = await getMoverPrices(viewer.userId, cards, token, from);
  if (prices.failed)
    return unavailable(
      "The price readings could not be read. Try again in a moment.",
      readHeaders(req),
    );

  const { up, down } = moversOf(sets, prices.points, { top, wished });
  const out = (m: (typeof up)[number]) => {
    /* Which printing the copies are and what state they are in, for the line under the name
       ("Holo · Near Mint"), and only where every copy held answers the same: a card held twice,
       once graded and once loose, says nothing rather than the first row's answer (agreedOn).
       On the wishlist, the same of the printings wished. */
    const held = m.card.variants.filter((v) => v.owned !== wished);
    return {
      tcgId: m.card.tcgId,
      name: m.card.name,
      number: m.card.number,
      printedNumber: printedNumberOf(m.card.tcgId),
      set: m.set,
      setAbbr: m.setAbbr,
      // The rarity of a printing held, so the line under the name reads as every list's: "PFL 004 · Double Rare".
      rarity: held.find((v) => v.rarity)?.rarity ?? null,
      image: m.card.image,
      finish: agreedOn(held.map((v) => v.finish)),
      foilPattern: agreedOn(held.map((v) => v.foilPattern)),
      edition: agreedOn(held.map((v) => v.edition)),
      condition: agreedOn(held.map((v) => v.condition)),
      grade: agreedOn(held.map((v) => v.grade)),
      copies: m.copies,
      was: m.was,
      now: m.now,
      change: m.change,
      pct: m.pct,
      total: m.total,
      from: m.from,
      to: m.to,
    };
  };
  return NextResponse.json({ up: up.map(out), down: down.map(out) }, { headers: readHeaders(req) });
}

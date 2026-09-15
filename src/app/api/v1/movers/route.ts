import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { ALL_READINGS, getCardPrices, getCollection } from "@/lib/core/collection/collection";
import { copiesHeld } from "@/lib/core/collection/cards-stats";
import { moversOf } from "@/lib/core/collection/movers";
import { printedNumberOf } from "@/lib/core/catalogue/set-codes";
import { historyKey, priceLanguageOf } from "@/lib/core/price-months.mjs";

/**
 * The caller's cards whose price moved most over a period, up and down.
 *
 * Home draws it under the value line, over the same period the chart shows, so `days` is the
 * chart's periods: 7, 30, 90, 180, or `all`. Each card is compared between its earliest and its
 * latest reading in the window (moversOf), per copy at its own printing, and ranked by what the
 * move did to the collection: the change times the copies held. `top` is how many each way.
 *
 * 503 where the collection or the readings could not be read: an empty list means nothing moved,
 * and a store that is down is not that.
 */
export const dynamic = "force-dynamic";

const PERIODS = { "7": 7, "30": 30, "90": 90, "180": 180, all: null } as const;
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
    return apiError(400, "days must be 7, 30, 90, 180 or `all`.", undefined, {
      headers: readHeaders(req),
    });
  const topRaw = params.get("top");
  const top = topRaw === null ? 5 : Number(topRaw);
  if (!Number.isInteger(top) || top < 1 || top > MAX_TOP)
    return apiError(400, `top must be a whole number from 1 to ${MAX_TOP}.`, undefined, {
      headers: readHeaders(req),
    });

  const token = bearer(req) ?? undefined;
  const { sets, failed } = await getCollection(viewer.userId, token);
  if (failed)
    return apiError(503, "The collection is unavailable.", undefined, {
      headers: readHeaders(req),
    });
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
  const prices = await getCardPrices(viewer.userId, cards, token, from);
  if (prices.failed)
    return unavailable(
      "The price readings could not be read. Try again in a moment.",
      readHeaders(req),
    );

  const { up, down } = moversOf(sets, prices.points, { top });
  const out = (m: (typeof up)[number]) => ({
    tcgId: m.card.tcgId,
    name: m.card.name,
    number: m.card.number,
    printedNumber: printedNumberOf(m.card.tcgId),
    set: m.set,
    setAbbr: m.setAbbr,
    image: m.card.image,
    copies: copiesHeld(m.card),
    was: m.was,
    now: m.now,
    change: m.change,
    pct: m.pct,
    total: m.total,
    from: m.from,
    to: m.to,
  });
  return NextResponse.json({ up: up.map(out), down: down.map(out) }, { headers: readHeaders(req) });
}

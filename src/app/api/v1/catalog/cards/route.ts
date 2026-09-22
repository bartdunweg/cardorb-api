import { NextResponse } from "next/server";
import { classicNumberOf } from "@/lib/core/catalogue/set-codes";
import { apiError, refuse } from "@/lib/api/respond";
import { authoriseOpen, openReadHeaders, readHeaders, refused } from "@/lib/api/guard";
import { englishShelfSets } from "@/lib/core/catalogue/catalogue";
import { mirrorCards } from "@/lib/core/catalogue/mirror";
import { getRows, tcgplayerPricesFor } from "@/lib/core/collection/collection";
import { pagePrintings } from "@/lib/core/catalogue/page-printings";
import { markOwnership, ownershipIndex } from "@/lib/core/collection/ownership";
import type { CatalogueMatch } from "@/lib/core/catalogue/ptcg-search";
import { bearer } from "@/lib/api/viewer";
import { adminClient } from "@/lib/storage/supabase";

/**
 * These cards, with the caller's own answer attached: owned, wishlist, quantity and the day's
 * price. What a browser that searched the catalogue itself (/v1/catalog/index) asks after
 * showing its hits — the part of a search result that is personal or daily, for the twenty on
 * screen. Same shape as a search hit, same reads, in parallel. `ids` is comma-separated
 * TCGdex ids, fifty at most; an id the copy lacks is left out.
 *
 * A request that carries no credential is answered too, because the command palette that asks
 * this route has to work for a visitor with no account. Owned, wishlist and quantity are left
 * out of every card then, rather than sent as false and 0: absent says nobody was asked, where
 * false and 0 would say the reader holds none of this, which is a statement about a collection
 * nobody named. The collection is not read at all, and the answer, belonging to nobody, is the
 * same for everybody and worth a shared cache holding (openReadHeaders).
 *
 * The price stays either way. The price is a search hit's and a set tile's: the headline
 * printing's, the one the card's sheet opens on (headline-printing.ts), named in `printing`,
 * and what a card trades at is a fact about the card rather than about its reader.
 */
export const dynamic = "force-dynamic";
const MAX_IDS = 50;

export async function GET(req: Request) {
  const who = await authoriseOpen(req);
  if (who && refused(who)) {
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  }
  /* A refusal is nobody's to keep, so every one below keeps readHeaders(); an answer to a
     reader who named themselves carries their marks and keeps it too. Only the open answer is
     the same for everybody, and only that one is worth a shared cache holding. */
  const headers = who ? readHeaders(req) : openReadHeaders(req);
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length || ids.length > MAX_IDS)
    return apiError(400, `ids must name 1 to ${MAX_IDS} cards.`, undefined, {
      headers: readHeaders(req),
    });
  const db = adminClient();
  if (!db) return refuse("noDatabase", { headers: readHeaders(req) });

  try {
    const [cards, mine, sets] = await Promise.all([
      mirrorCards(db, [...new Set(ids)]),
      // No viewer, no rows: there is nobody whose collection this would be, so the read is not
      // made at all rather than made and thrown away.
      who ? getRows(who.userId, bearer(req) ?? undefined) : null,
      englishShelfSets().catch(() => []),
    ]);
    /* The marks go with the rows. Left unmarked the cards keep the shape the catalogue has,
       which is the point: no owned, no wishlist, no quantity, rather than three fields saying
       none. */
    const marked: CatalogueMatch[] = mine
      ? markOwnership(ownershipIndex(mine.rows, null, sets), cards)
      : cards;
    const priceKey = (c: (typeof marked)[number]) => c.tcgId ?? c.id;
    const printingsRead = pagePrintings(
      marked.map((c) => ({ key: priceKey(c), sheet: c.sheet })),
      null,
    );
    const prices = await tcgplayerPricesFor(marked.map(priceKey), null, printingsRead);
    return NextResponse.json(
      {
        cards: marked.map((c) => ({
          ...c,
          // As the card prints it, for its label; the set route says why it can differ from `number`.
          printedNumber: classicNumberOf(c.tcgId) ?? c.number,
          price: prices.get(priceKey(c))?.price ?? null,
          // The printing that price is, keyed as the sheet's buttons are; null without a price.
          printing: prices.get(priceKey(c))?.printing ?? null,
        })),
      },
      { headers },
    );
  } catch (err) {
    console.error("Catalogue cards unavailable:", err);
    return refuse("noDatabase", { headers: readHeaders(req) });
  }
}

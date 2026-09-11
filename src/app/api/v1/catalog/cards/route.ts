import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { englishSets } from "@/lib/core/catalogue/tcgdex-browse";
import { mirrorCards } from "@/lib/core/catalogue/mirror";
import { getRows, guidePricesFor } from "@/lib/core/collection/collection";
import { markOwnership, ownershipIndex } from "@/lib/core/collection/ownership";
import { bearer } from "@/lib/api/viewer";
import { adminClient } from "@/lib/storage/supabase";

/**
 * These cards, with the caller's own answer attached: owned, wishlist, quantity and the day's
 * price. What a browser that searched the catalogue itself (/v1/catalog/index) asks after
 * showing its hits — the part of a search result that is personal or daily, for the twenty on
 * screen. Same shape as a search hit, same reads, in parallel. `ids` is comma-separated
 * TCGdex ids, fifty at most; an id the copy lacks is left out.
 */
export const dynamic = "force-dynamic";
const MAX_IDS = 50;

export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who)) {
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  }
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
    const [cards, { rows }, sets] = await Promise.all([
      mirrorCards(db, [...new Set(ids)]),
      getRows(who.userId, bearer(req) ?? undefined),
      englishSets().catch(() => []),
      guidePricesFor([]),
    ]);
    const marked = markOwnership(ownershipIndex(rows, null, sets), cards);
    const prices = await guidePricesFor(marked.map((c) => c.tcgId ?? c.id));
    return NextResponse.json(
      {
        cards: marked.map((c) => ({
          ...c,
          price: prices.get(c.tcgId ?? c.id)?.price ?? null,
          priceHolo: prices.get(c.tcgId ?? c.id)?.holo ?? null,
        })),
      },
      { headers: readHeaders(req) },
    );
  } catch (err) {
    console.error("Catalogue cards unavailable:", err);
    return refuse("noDatabase", { headers: readHeaders(req) });
  }
}

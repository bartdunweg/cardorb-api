import { adminClient } from "@/lib/storage/supabase";
import { catalogueCardVariants } from "@/lib/storage/postgres";
import { printingsOf, type Printing, type TcgVariant } from "./card-printings";
import type { BrowseLanguage } from "./tcgdex-browse";

/**
 * The printings of a page of catalogue cards, in each card's sheet order, keyed by the id a price
 * is keyed by: what the set page's headline printing is chosen from (headline-printing.ts).
 *
 * The sheet's printings are printingsOf() over the variants the copy keeps for the card, so the
 * same read here gives the same list. A card read live from TCGdex carries its variants on its
 * `sheet` and needs no copy; a card neither has is printingsOf() over nothing, which is still an
 * answer for the cards TCGplayer sells as a product of their own. One read of the copy for the page;
 * a copy that cannot be read leaves each card to what it carries.
 */
export async function pagePrintings(
  cards: { key: string; sheet?: { variants?: TcgVariant[] } | null }[],
  language: BrowseLanguage | null,
): Promise<Map<string, Printing[]>> {
  const db = adminClient();
  const copied = db
    ? await catalogueCardVariants(
        db,
        cards.map((c) => c.key),
        language ?? "en",
      ).catch((err) => {
        console.error("Printings unreadable from the copy, the page's own variants stand:", err);
        return new Map<string, TcgVariant[]>();
      })
    : new Map<string, TcgVariant[]>();
  return new Map(
    cards.map((c) => [
      c.key,
      printingsOf(copied.get(c.key) ?? c.sheet?.variants, language ? null : c.key),
    ]),
  );
}

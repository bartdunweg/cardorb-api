import type { CollectionRow } from "./collection-row";
import {
  NOT_OWNED,
  cardNumber,
  finishFrom,
  patternFrom,
  quantityFrom,
  type CsvResult,
} from "./csv";

/**
 * An export from Dex, which is not a spreadsheet with lucky column names.
 *
 * guessColumns() exists because most files are somebody's own list and the only
 * honest thing to do with their headers is guess and show the guess. Dex is the
 * other kind: the columns are fixed, they are the same for everyone, and three
 * of them mean something no generic mapping could work out.
 *
 * Guessing at this file gets every one of those three wrong, and quietly:
 *
 *   Quantity   Dex exports the whole checklist of every set you have touched,
 *              writing 0 beside the cards you do not have. There is no owned
 *              column, so rowsFrom()'s default — no column means owned — turns
 *              2,440 cards you have never held into cards you own. That is more
 *              than half of a real file.
 *   Type       Dex's first column, holding "collection", not an energy type.
 *              /^type/ takes it and every card imports as Colorless-ish
 *              nonsense.
 *   Category   Dex's own folders, one of which is the wishlist. Nothing in a
 *              column map can express "this value means the card is wanted".
 *
 * So Dex is recognised and read by its own rules, and everything else still
 * goes through guessColumns(). The route says which of the two it used, and the
 * screen says so out loud, because a person who uploaded a Dex export and was
 * shown a column-mapping puzzle would reasonably assume it had not worked.
 */

/**
 * The header Dex writes, in order. Matched on the first six, which is enough to
 * be sure and lets Dex add a column at the end without this going quiet.
 */
const DEX_HEADER = ["type", "category", "locale", "series", "set", "id"];

export function looksLikeDex(header: string[]): boolean {
  const norm = header.map((h) => h.trim().toLowerCase());
  return DEX_HEADER.every((want, i) => norm[i] === want);
}

/** Where each field sits, by name rather than by position. */
const columns = (header: string[]) => {
  const norm = header.map((h) => h.trim().toLowerCase());
  const at = (name: string) => norm.indexOf(name);
  return {
    category: at("category"),
    series: at("series"),
    set: at("set"),
    number: at("number"),
    name: at("name"),
    variant: at("variant"),
    rarity: at("rarity"),
    quantity: at("quantity"),
    notes: norm.map((h, i) => (h.startsWith("note") ? i : -1)).filter((i) => i !== -1),
  };
};

/**
 * What Dex calls the wishlist. Its other folders — "My Collection", "New buys",
 * whatever somebody named theirs — are cards they have, and land in the
 * collection. Only this one word changes what a row *is* rather than where it
 * sits, which is why it is the one that is matched.
 */
const WISHLIST = /^wish ?list$/i;

/**
 * A Dex grid, as collection rows.
 *
 * The counted skips are the point of this function as much as the rows are. A
 * person who uploads 4,536 lines and is told "2,096 cards" needs the other
 * 2,440 accounted for in the same breath, or the number reads as data loss.
 */
export function dexRows(grid: string[][]): CsvResult {
  const header = grid[0] ?? [];
  const c = columns(header);
  const rows: CollectionRow[] = [];
  const skipped: { line: number; why: string }[] = [];

  const at = (r: string[], i: number) => (i < 0 ? "" : (r[i] ?? "").trim());

  grid.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = at(r, c.name);
    const set = at(r, c.set);

    if (!name && !set) return;
    if (!name) {
      skipped.push({ line, why: "no card name" });
      return;
    }
    if (!set) {
      skipped.push({ line, why: "no set" });
      return;
    }

    const wanted = WISHLIST.test(at(r, c.category));
    const quantity = quantityFrom(at(r, c.quantity));

    // The whole reason this file exists. A quantity of zero outside the
    // wishlist is a checklist line: Dex is telling us which printings the set
    // contains, not which ones are yours. Dropped rather than written as
    // not-owned, because R-DATA-002 says a card you do not own belongs on the
    // wishlist, and this is not on anybody's wishlist either.
    if (!wanted && quantity === 0) {
      skipped.push({ line, why: NOT_OWNED });
      return;
    }

    const notes = c.notes
      .map((i) => at(r, i))
      .filter(Boolean)
      .join("\n");

    rows.push({
      id: null,
      name,
      // "48/108" as the card prints it; the catalogue files it under "48".
      number: cardNumber(at(r, c.number)),
      setName: set,
      rarity: at(r, c.rarity) || null,
      // Dex's "Series" is the era — "Black & White", "EX", "Scarlet & Violet" —
      // which is what gen holds for every row that came from Notion.
      gen: at(r, c.series) || null,
      // Dex has no energy type. Its "Type" column says "collection", and
      // reading it as one is what a generic guess does wrong here.
      types: [],
      owned: !wanted,
      excluded: false,
      // Dex exports no acquisition date. Left null so the column default —
      // now() — applies, and the import says so.
      acquiredAt: null,
      finish: finishFrom(at(r, c.variant)),
      // Dex names the foil pattern in the same column: "Cosmos Holo" is a holo
      // whose foil is cosmos, and both halves of that are worth keeping.
      foilPattern: patternFrom(at(r, c.variant)),
      // A wishlist row is a card you want one of, whatever Dex counted.
      quantity: wanted ? 1 : Math.max(1, quantity ?? 1),
      condition: null,
      grade: null,
      language: null,
      // Dex's Price is what the card is worth today, not what anybody paid for
      // it. This app fetches the first and would be lying about the second.
      purchasePrice: null,
      purchaseDate: null,
      notes: notes || null,
      isFavorite: false,
      collectionId: null,
    });
  });

  return { rows, skipped };
}

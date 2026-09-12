import { type CardItem, copyPrice } from "./items";

/**
 * The collection as a CSV in the shape Dex writes.
 *
 * Dex's export is the one file every other collection tool has learned to
 * read, and it is the file this app's own import recognises (dex.ts), so a
 * file written here goes back in unchanged and goes into Dex, Collectr or a
 * spreadsheet the way a Dex export does. Bart's call (2026-09-12): as much the
 * same format as Dex as possible, so other tools can do something with it.
 *
 * The same columns in the same order, semicolons between them, one row per
 * kind of copy with its count in Quantity. What Dex has no column for and this
 * app knows (the condition, the language, the day it was acquired, what was
 * paid) follows Dex's columns rather than displacing them: a reader that stops
 * at Note 5 sees a Dex file, and dexRows() reads the extra four back when they
 * are there.
 *
 *   Type       "collection", as Dex writes it on every row.
 *   Category   Dex's folder. "My Collection" for a copy that is held, "Wishlist"
 *              for one that is wanted: the one Category dex.ts reads as meaning
 *              something.
 *   Locale     "International" for the English catalogue's printings, whatever
 *              language the copy is in; Dex names the other catalogues by their
 *              language.
 *   Series     The era, which is what gen holds.
 *   Set        The official name, the one every screen shows since #306.
 *   Id         The catalogue id, where the card was matched.
 *   Number     As printed, without the denominator: the catalogue's number.
 *   Variant    Dex's words for the finish, the pattern in brackets as Dex
 *              writes a cosmos holo: "Reverse Holo (Cosmos Holo)".
 *   Quantity   The count. Never 0: a row here is a copy somebody has or wants,
 *              not a checklist line.
 *   Price      Dex's format, "€ 8,63", or Dex's dash where nothing prices it.
 *   Note 1     The notes, whole. Note 2 to 5 stay empty.
 *
 * Illustrator is empty: this app does not keep it, and an empty column is a
 * column a reader can skip, where a missing one shifts every column after it.
 */

const HEADER = [
  "Type",
  "Category",
  "Locale",
  "Series",
  "Set",
  "Id",
  "Number",
  "Name",
  "Variant",
  "Rarity",
  "Illustrator",
  "Quantity",
  "Price",
  "Note 1",
  "Note 2",
  "Note 3",
  "Note 4",
  "Note 5",
  "Condition",
  "Language",
  "Acquired",
  "Purchase price",
] as const;

const FINISH_WORDS: Record<string, string> = {
  normal: "Normal",
  "reverse-holo": "Reverse Holo",
  holo: "Holo",
  "poke-ball": "Poké Ball Reverse",
  "master-ball": "Master Ball Reverse",
};

const PATTERN_WORDS: Record<string, string> = {
  cosmos: "Cosmos Holo",
  "cracked-ice": "Cracked Ice Holo",
  starlight: "Starlight Holo",
  confetti: "Confetti Holo",
  "vertical-line": "Vertical Line Holo",
};

const LOCALES: Record<string, string> = {
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  "zh-tw": "Traditional Chinese",
  "zh-cn": "Simplified Chinese",
};

/** Dex's word for the printing: the finish, and the pattern in brackets where there is one. */
export function variantWord(finish: string | null, pattern: string | null): string {
  const base = finish ? (FINISH_WORDS[finish] ?? finish) : "";
  const shape = pattern ? (PATTERN_WORDS[pattern] ?? pattern) : "";
  if (base && shape) return `${base} (${shape})`;
  return base || shape;
}

/** Dex's price: a euro sign, a space, the amount with a comma; its dash where there is none. */
export const priceWord = (euros: number | null): string =>
  euros === null ? "—" : `€ ${euros.toFixed(2).replace(".", ",")}`;

/**
 * One field, quoted the way a spreadsheet expects when it has to be: a
 * semicolon, a quote or a line break inside it.
 */
const field = (value: string): string =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const row = (values: readonly string[]): string => values.map(field).join(";");

/** The export, as text. The caller adds the byte order mark; see the route. */
export function dexCsv(items: readonly CardItem[]): string {
  const lines = [row(HEADER)];
  for (const it of items) {
    const language = it.language ?? "";
    lines.push(
      row([
        "collection",
        it.owned ? "My Collection" : "Wishlist",
        LOCALES[language] ?? "International",
        it.gen ?? "",
        it.setTitle || it.set,
        it.tcgId ?? "",
        it.number,
        it.name,
        variantWord(it.finish, it.foilPattern),
        it.rarity ?? "",
        "",
        String(it.quantity),
        priceWord(copyPrice(it)),
        it.notes ?? "",
        "",
        "",
        "",
        "",
        it.condition ?? "",
        language,
        it.acquiredAt ? it.acquiredAt.slice(0, 10) : "",
        it.purchasePrice === null ? "" : it.purchasePrice.toFixed(2).replace(".", ","),
      ]),
    );
  }
  // CRLF, as Dex and Excel write it; a file that ends in a line break opens
  // without a trailing empty row.
  return lines.join("\r\n") + "\r\n";
}

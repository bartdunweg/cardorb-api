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
 *   Number     As Dex writes it, without the denominator (dexNumber): a number
 *              that opens on its digits without its zeros (3 for 003), a
 *              lettered one as printed (TG03, SWSH179).
 *   Variant    Dex's words for the finish, the pattern in brackets as Dex
 *              writes a cosmos holo: "Reverse Holo (Cosmos Holo)".
 *   Quantity   The count. Never 0: a row here is a copy somebody has or wants,
 *              not a checklist line.
 *   Price      Dex's format, "€ 8,63", or Dex's dash where nothing prices it.
 *   Note 1     The notes, whole. Note 2 to 5 stay empty.
 *
 * Edition is one of ours, after Note 5: Dex has no column for it and writes the run in Variant
 * instead, which it can only do by giving up saying "1st Edition Holo". Ours says both.
 *
 * Finish is one of ours too, the copy's finish in this app's word ("energy-symbol"), and read back
 * ahead of Variant: Dex has no known word for an Energy Symbol reverse, and inventing one would put
 * a name in Dex's column that no Dex file carries.
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
  "Edition",
  "Finish",
  "Grade",
  "Purchase date",
  "Favorite",
] as const;

const FINISH_WORDS: Record<string, string> = {
  normal: "Normal",
  "reverse-holo": "Reverse Holo",
  holo: "Holo",
  "poke-ball": "Poké Ball Reverse",
  "master-ball": "Master Ball Reverse",
  /* Not words Dex is known to write: no Dex export with an Energy Symbol, Friend, Love, Quick or
     Dusk Ball or Team Rocket reverse has been read. Variant says what Dex does know, a reverse
     holo, and the Finish column after Dex's own says which. */
  "energy-symbol": "Reverse Holo",
  "friend-ball": "Reverse Holo",
  "love-ball": "Reverse Holo",
  "quick-ball": "Reverse Holo",
  "dusk-ball": "Reverse Holo",
  "team-rocket": "Reverse Holo",
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
};

/** Dex's word for the printing: the finish, and the pattern in brackets where there is one. */
export function variantWord(finish: string | null, pattern: string | null): string {
  const base = finish ? (FINISH_WORDS[finish] ?? finish) : "";
  const shape = pattern ? (PATTERN_WORDS[pattern] ?? pattern) : "";
  if (base && shape) return `${base} (${shape})`;
  return base || shape;
}

/**
 * The number as Dex writes it. Dex drops the zeros a card prints in front of its digits (Shrouded
 * Fable's 003/064 is "3/64", Obsidian Flames' 056/197 is "56/197") and keeps a lettered number whole (TG03,
 * SV064, SWSH179, SM210): every row of dex-export.fixture.csv, a real export, reads that way. The
 * printed number is the catalogue's (printedNumber), the row's where nothing matched; either way the
 * copy's "001" and a row's "1" write the same line.
 */
export function dexNumber(it: Pick<CardItem, "number" | "printedNumber">): string {
  // A Classic Collection card prints another set's number with its total (4/102): the export keeps
  // the row's number, as it wrote before the catalogue said so, so an export imports back the same.
  const printed = it.printedNumber?.includes("/") ? null : it.printedNumber;
  const n = (printed ?? it.number).trim();
  return /^\d/.test(n) ? n.replace(/^0+(?=\d)/, "") : n;
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
        dexNumber(it),
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
        it.edition ?? "",
        it.finish ?? "",
        it.grade ?? "",
        it.purchaseDate ? it.purchaseDate.slice(0, 10) : "",
        it.isFavorite ? "Yes" : "",
      ]),
    );
  }
  // CRLF, as Dex and Excel write it; a file that ends in a line break opens
  // without a trailing empty row.
  return lines.join("\r\n") + "\r\n";
}

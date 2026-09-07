import type { CollectionRow } from "./collection-row";
import { isFinish, isLanguage, type Finish, type Language } from "./collection-row";

/**
 * A spreadsheet somebody exported, turned into rows.
 *
 * Hand-written rather than a dependency, matching what this project does
 * elsewhere for the same reason: lib/api/rate-limit.ts is a hand-rolled
 * limiter, and the argument is the same both times — the whole of RFC 4180 that
 * matters here is quotes, doubled quotes and line endings, and a parser is
 * easier to test than a dependency is to audit.
 *
 * Pure, so every case below is a unit test rather than a fixture uploaded
 * through a form.
 *
 * What this file does *not* do is decide the character encoding. By the time a
 * CSV reaches here it is a JavaScript string, and that question was already
 * answered by whoever read the bytes — the web app, which sniffs the byte order
 * mark and decodes UTF-16 itself. A UTF-16 file read as UTF-8 does not arrive
 * here looking odd; it arrives looking like nothing at all.
 */

/**
 * Which character separates the fields.
 *
 * The comma used to be assumed, which is what the format is named after and
 * what half of the world exports. The other half exports semicolons — every
 * Excel on a machine whose decimal separator is the comma does, and so does
 * Dex — and a semicolon file parsed on commas is one enormous single-column
 * row that matches no header and imports as nothing.
 *
 * Counted outside quotes on the header line alone: a quoted field may contain
 * any of these, and the header is the one line guaranteed to have a separator
 * between every column. Ties go to the comma, which is the format's own name.
 */
export function sniffDelimiter(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') i++;
        else quoted = false;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "\n" || c === "\r") break;
    else if (c in counts) counts[c]!++;
  }

  const best = (Object.keys(counts) as string[]).reduce((a, b) =>
    counts[b]! > counts[a]! ? b : a,
  );
  return counts[best]! > 0 ? best : ",";
}

/**
 * Split a CSV into rows of fields.
 *
 * The four things that actually break parsers, all handled: a comma inside
 * quotes, a doubled quote meaning one quote, a newline inside quotes, and CRLF
 * line endings from anything that has been near Excel. Plus the byte order mark
 * Excel puts at the front of a UTF-8 file, which is invisible and turns the
 * first header into something that matches nothing.
 *
 * `delimiter` is sniffed from the header when it is not given, so a caller that
 * knows better — a test, mostly — can still say.
 */
export function parseCsv(text: string, delimiter = sniffDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // The BOM. Not stripping it means the first column is called "﻿name"
  // and no mapping ever finds it. UTF-16's own mark is gone by now — the
  // decoder eats it — but a UTF-8 one survives into the string.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;

    if (quoted) {
      if (c === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // \r\n is one break, not two. Without this every other row is empty.
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }

  // Whatever was still being read when the file ended. A file with no trailing
  // newline is the common case, not the edge one.
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  // A trailing newline leaves one empty row behind it.
  return rows.filter((r) => r.some((f) => f.trim()));
}

export type ColumnMap = {
  name: number;
  set: number;
  number?: number;
  rarity?: number;
  gen?: number;
  types?: number;
  owned?: number;
  acquired?: number;
  quantity?: number;
  variant?: number;
  condition?: number;
  language?: number;
  notes?: number;
};

/**
 * Guess which column is which from the header row.
 *
 * Loose on purpose, and the same instinct as fieldOf() in the Notion adapter:
 * these are somebody else's column names. "Card Name", "name", "NAME" and
 * "Card" all mean the same thing, and refusing a file because its header says
 * "Set Name" instead of "set" would be refusing the file for being ordinary.
 *
 * Returns what it found rather than throwing. The screen shows the mapping and
 * lets it be corrected, which is the only honest answer for a guess.
 */
export function guessColumns(header: string[]): Partial<ColumnMap> {
  const norm = header.map((h) => h.trim().toLowerCase());
  const find = (...patterns: RegExp[]) => {
    for (const p of patterns) {
      const i = norm.findIndex((h) => p.test(h));
      if (i !== -1) return i;
    }
    return undefined;
  };

  return {
    name: find(/^card ?name$/, /^name$/, /name/, /^card$/),
    set: find(/^set ?name$/, /^set$/, /set/, /expansion/),
    number: find(/^(card ?)?(number|no|num|#)$/, /number/),
    rarity: find(/rarit/),
    gen: find(/^gen/, /era|series/),
    types: find(/^type/),
    owned: find(/owned|have|in ?collection|binder/),
    acquired: find(/acquired|added|date|bought|obtained/),
    // Deliberately not /count/: a "Count" column in an export is as often the
    // number of a set you have completed as it is copies of one card.
    quantity: find(/^(qty|quantity|copies|amount)$/, /quantity|copies/),
    variant: find(/^(variant|finish|printing|foil)$/, /variant|finish|printing/),
    condition: find(/^(condition|cond|grade)$/, /condition/),
    language: find(/^(language|lang|locale)$/, /language/),
    notes: find(/^(notes?|comment|remark)s?$/, /^note/),
  };
}

/** Values a person plausibly writes for "no". Everything else is yes. */
const NO = /^(false|no|n|0|wishlist|want|wanted)$/i;

/**
 * The printed number, as the catalogue writes it.
 *
 * Exports print the number the way the card does — "48/108", "174/165" — and
 * TCGdex stores the left half alone. numberForms() tries a bare number with and
 * without leading zeros and never thinks to drop a denominator, so a whole
 * import of "48/108" matches nothing, has no scan and no price, and looks like
 * a catalogue outage rather than a formatting difference.
 *
 * Only when what follows the slash is digits. "TG12/TG30" keeps its left half
 * for the same reason, but "H1/H32" and a genuine name with a slash in it are
 * left alone rather than guessed at.
 */
export const cardNumber = (n: string): string => {
  const m = /^(\S+)\/\d+$/.exec(n.trim());
  return m ? m[1]! : n.trim();
};

/**
 * Which printing a copy is, from whatever the export called it.
 *
 * Matched on the front of the string rather than the whole of it, because the
 * qualifier an export adds is almost always a suffix: Dex writes "Reverse Holo
 * (Cosmos)" and "Holo (No e-Reader Logo)" for cards that are, for our purposes,
 * a reverse and a holo. Reverse is tested first — "Reverse Holo" starts with
 * neither "Holo" nor "Normal", but a naive contains() would call it holo.
 *
 * Null for anything unrecognised rather than a guess at normal: a wrong finish
 * reads the wrong price field (see isReverseFinish), and "I do not know" is a
 * thing this app can show.
 */
export function finishFrom(variant: string): Finish | null {
  const v = variant.trim().toLowerCase();
  if (!v) return null;
  if (isFinish(v)) return v;
  if (v.startsWith("reverse")) return "reverse-holo";
  if (v.startsWith("master ball")) return "master-ball";
  if (v.startsWith("poke ball") || v.startsWith("poké ball")) return "poke-ball";
  if (v.startsWith("holo") || v.startsWith("cosmos holo")) return "holo";
  if (v.startsWith("normal")) return "normal";
  return null;
}

/** A copy count, or null where the column said nothing usable. */
export function quantityFrom(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type CsvResult = {
  rows: CollectionRow[];
  /** Rows that could not be used, with the line number and the reason. */
  skipped: { line: number; why: string }[];
};

/**
 * The parsed grid, as collection rows.
 *
 * Two rules carried over from scripts/import-notion.mjs, both of which cost
 * something to get wrong.
 *
 * A row with no set or no name is skipped and counted, never silently dropped:
 * buildCollection() cannot place or draw it, so importing it would mean a card
 * that exists in the database and nowhere on screen.
 *
 * And a missing "owned" value means **owned**. That is the single most
 * important line here. The column defaults to true in Postgres, Notion's
 * checkbox was read as `!== false`, and a spreadsheet that simply has no such
 * column is somebody's binder rather than somebody's wishlist. Getting it
 * backwards turns a collection into a shopping list, quietly, at scale.
 *
 * A quantity of zero is the exception to that, and it is why the rule needed a
 * second sentence. An export that lists a whole set and writes 0 beside the
 * cards you do not have is stating ownership in the quantity column rather than
 * in an owned one; taking the default there would import somebody's checklist
 * as their collection. Zero is dropped, not wishlisted — R-DATA-002 puts every
 * card you do not own on the wishlist, so a row that is neither has no business
 * being written at all.
 */
export function rowsFrom(grid: string[][], map: ColumnMap, hasHeader = true): CsvResult {
  const rows: CollectionRow[] = [];
  const skipped: { line: number; why: string }[] = [];

  const at = (r: string[], i?: number) => (i === undefined ? "" : (r[i] ?? "").trim());

  grid.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    // The line as a person counts it, in the file they are looking at.
    const line = i + (hasHeader ? 2 : 1);

    const name = at(r, map.name);
    const set = at(r, map.set);
    // A blank line is not a mistake; a half-filled one is.
    if (!name && !set) return;
    if (!name) {
      skipped.push({ line, why: "no card name" });
      return;
    }
    if (!set) {
      skipped.push({ line, why: "no set" });
      return;
    }

    const ownedRaw = at(r, map.owned);
    const quantity = quantityFrom(at(r, map.quantity));
    const owned = ownedRaw ? !NO.test(ownedRaw) : quantity === null || quantity > 0;

    if (!owned && quantity === 0) {
      skipped.push({ line, why: "not owned" });
      return;
    }

    const acquired = at(r, map.acquired);
    const parsed = acquired ? new Date(acquired) : null;
    const language = at(r, map.language).toLowerCase();

    rows.push({
      id: null,
      name,
      number: cardNumber(at(r, map.number)),
      setName: set,
      rarity: at(r, map.rarity) || null,
      gen: at(r, map.gen) || null,
      // Semicolons, because the comma is the field separator. A file that uses
      // commas inside a quoted types column still works — this splits what the
      // parser already handed over as one field.
      types: at(r, map.types)
        .split(/[;|]/)
        .map((t) => t.trim())
        .filter(Boolean),
      owned,
      excluded: false,
      // An unparseable date is dropped rather than becoming today: the value
      // history in the snapshot script is built on this column, and a wrong
      // date is worse than a missing one.
      acquiredAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      finish: finishFrom(at(r, map.variant)),
      // One, where the file did not say. Not zero: a row that reached here is a
      // card somebody has, and quantity is what the collection counts.
      quantity: quantity && quantity > 0 ? quantity : 1,
      condition: at(r, map.condition) || null,
      grade: null,
      language: isLanguage(language) ? (language as Language) : null,
      purchasePrice: null,
      purchaseDate: null,
      notes: at(r, map.notes) || null,
      isFavorite: false,
      collectionId: null,
    });
  });

  return { rows, skipped };
}

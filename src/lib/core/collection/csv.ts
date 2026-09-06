import type { CollectionRow } from "./collection-row";

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
 */

/**
 * Split a CSV into rows of fields.
 *
 * The four things that actually break parsers, all handled: a comma inside
 * quotes, a doubled quote meaning one quote, a newline inside quotes, and CRLF
 * line endings from anything that has been near Excel. Plus the byte order mark
 * Excel puts at the front of a UTF-8 file, which is invisible and turns the
 * first header into something that matches nothing.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // The BOM. Not stripping it means the first column is called "﻿name"
  // and no mapping ever finds it.
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
    else if (c === ",") {
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
  };
}

/** Values a person plausibly writes for "no". Everything else is yes. */
const NO = /^(false|no|n|0|wishlist|want|wanted)$/i;

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
    const acquired = at(r, map.acquired);
    const parsed = acquired ? new Date(acquired) : null;

    rows.push({
      id: null,
      name,
      number: at(r, map.number),
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
      owned: !(ownedRaw && NO.test(ownedRaw)),
      excluded: false,
      // An unparseable date is dropped rather than becoming today: the value
      // history in the snapshot script is built on this column, and a wrong
      // date is worse than a missing one.
      acquiredAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      // A spreadsheet import has never carried these.
      // A spreadsheet has no column for this and guessing from a rarity
      // string is what put the app in this position to begin with.
      finish: null,
      quantity: 1,
      condition: null,
      grade: null,
      language: null,
      purchasePrice: null,
      purchaseDate: null,
      notes: null,
      isFavorite: false,
      collectionId: null,
    });
  });

  return { rows, skipped };
}

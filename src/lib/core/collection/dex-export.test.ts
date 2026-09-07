import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseCsv, sniffDelimiter } from "./csv";
import { dexRows, looksLikeDex } from "./dex";
import { importKey, splitExisting } from "./import-match";
import { resolveSetIds } from "../catalogue/catalogue";
import sets from "./tcgdex-sets.fixture.json";

/**
 * A real export, kept.
 *
 * dex.test.ts pins the rules one at a time with hand-written lines. This pins
 * them all at once against `dex-export.fixture.csv`, which is not written by
 * hand: it is 45 lines lifted unaltered from a 4,536-line export somebody
 * actually produced, chosen to hold one of every case that file contained —
 * every variant that appears on an owned card and on an unowned one, every copy
 * count from one to four, all three of its folders, and every set name whose
 * spelling the catalogue argues with.
 *
 * It is here because the numbers below were once measured by hand, against the
 * file, on a laptop, and a measurement that is not a test is a thing that was
 * true on a Tuesday. Every one of these counts is a rule that would otherwise
 * be quietly re-broken: 2,440 of that file's rows were cards its owner does not
 * have, and the version of this importer that shipped before would have added
 * every one of them.
 */
const text = readFileSync(new URL("./dex-export.fixture.csv", import.meta.url), "utf8");
const grid = parseCsv(text);

describe("a real Dex export", () => {
  it("is read on its semicolons and recognised by its header", () => {
    expect(sniffDelimiter(text)).toBe(";");
    expect(looksLikeDex(grid[0]!)).toBe(true);
  });

  it("keeps the cards and drops the checklist", () => {
    const { rows, skipped } = dexRows(grid);

    expect(rows.filter((r) => r.owned)).toHaveLength(35);
    expect(rows.filter((r) => !r.owned)).toHaveLength(4);
    expect(skipped).toHaveLength(6);
    // Everything in the file is accounted for, one way or the other.
    expect(rows.length + skipped.length).toBe(grid.length - 1);
    expect(skipped.every((s) => s.why === "not owned (quantity 0)")).toBe(true);
  });

  it("counts copies rather than lines", () => {
    const owned = dexRows(grid).rows.filter((r) => r.owned);

    expect(owned.reduce((n, r) => n + (r.quantity ?? 0), 0)).toBe(41);
    expect(Math.max(...owned.map((r) => r.quantity ?? 0))).toBe(4);
  });

  it("leaves no printed number carrying its denominator", () => {
    expect(dexRows(grid).rows.filter((r) => r.number.includes("/"))).toEqual([]);
  });

  it("reads every variant it kept as a finish this app knows", () => {
    const finishes = new Set(dexRows(grid).rows.map((r) => r.finish));

    expect([...finishes].filter((f) => f !== null).sort()).toEqual([
      "holo",
      "normal",
      "reverse-holo",
    ]);
  });

  it("takes nothing from the columns that would be a lie", () => {
    const rows = dexRows(grid).rows;

    // Dex's Price is the market price, not what anybody paid.
    expect(rows.every((r) => r.purchasePrice === null)).toBe(true);
    // Dex's Type column says "collection", not an energy type.
    expect(rows.every((r) => r.types.length === 0)).toBe(true);
  });

  it("sends every set name it holds to exactly one catalogue set", () => {
    const names = [...new Set(dexRows(grid).rows.map((r) => r.setName))];

    // All 31 of them, with nothing left over. Run against the full 4,536-row
    // export this came from, the same rules find a catalogue card for all 2,097
    // rows it writes — scan, price and page for every one.
    expect(names.filter((n) => resolveSetIds(n, sets as never).length !== 1)).toEqual([]);
  });

  it("names the right set where the spelling differs", () => {
    const id = (name: string) => resolveSetIds(name, sets as never)[0];

    // A promo must not land on the era's base set.
    expect(id("Sword & Shield Promos")).toBe("swshp");
    expect(id("Scarlet & Violet Promos")).toBe("svp");
    // An era prefix the catalogue does not use.
    expect(id("EX Crystal Guardians")).toBe("ex14");
    // And the longer of two overlapping names wins.
    expect(id("EX Dragon Frontiers")).toBe("ex15");
  });

  it("recognises every one of its own rows on a second run", () => {
    const { rows } = dexRows(grid);
    const held = new Set(rows.map(importKey));

    // Importing the same file twice must add nothing. There is no database
    // constraint that would catch this; splitExisting is the whole defence.
    expect(splitExisting(rows, held).fresh).toEqual([]);
  });
});

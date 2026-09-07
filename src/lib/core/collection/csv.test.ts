import { describe, expect, it } from "vitest";
import { finishFrom, guessColumns, parseCsv, rowsFrom, type ColumnMap } from "./csv";

const MAP: ColumnMap = { name: 0, set: 1, number: 2, owned: 3, types: 4, acquired: 5 };

describe("parseCsv", () => {
  it("keeps a comma that is inside quotes", () => {
    expect(parseCsv('a,"one, two",c')).toEqual([["a", "one, two", "c"]]);
  });

  it("reads a doubled quote as one quote", () => {
    expect(parseCsv('"say ""hello""",x')).toEqual([['say "hello"', "x"]]);
  });

  it("keeps a newline that is inside quotes", () => {
    expect(parseCsv('"two\nlines",x')).toEqual([["two\nlines", "x"]]);
  });

  it("treats CRLF as one break", () => {
    // Anything that has been near Excel. Without this every other row is empty.
    expect(parseCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("strips the byte order mark Excel writes", () => {
    // Invisible, and it makes the first header match nothing at all.
    const [row] = parseCsv("﻿name,set");
    expect(row![0]).toBe("name");
  });

  it("keeps the last row when the file has no trailing newline", () => {
    expect(parseCsv("a,b\nc,d")).toHaveLength(2);
  });

  it("drops rows that are entirely empty", () => {
    expect(parseCsv("a,b\n\n\nc,d")).toHaveLength(2);
  });

  it("keeps an empty field in the middle", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});

describe("guessColumns", () => {
  it("finds the usual spellings", () => {
    expect(guessColumns(["Card Name", "Set Name", "Number", "Rarity"])).toMatchObject({
      name: 0,
      set: 1,
      number: 2,
      rarity: 3,
    });
  });

  it("does not mind capitals or spacing", () => {
    expect(guessColumns([" NAME ", "set"])).toMatchObject({ name: 0, set: 1 });
  });

  it("prefers the exact header over one that merely contains the word", () => {
    // "Set Name" contains "name", and a file with both must not map name to it.
    const g = guessColumns(["Set Name", "Name"]);
    expect(g.name).toBe(1);
    expect(g.set).toBe(0);
  });
});

describe("rowsFrom", () => {
  const grid = (...lines: string[]) =>
    parseCsv(["name,set,number,owned,types,acquired", ...lines].join("\n"));

  it("treats a missing owned value as owned", () => {
    // The most important line in the file. The column defaults to true in
    // Postgres, Notion's checkbox was read as `!== false`, and a spreadsheet
    // with no such column is a binder rather than a wishlist. Backwards, this
    // turns a collection into a shopping list at scale.
    const { rows } = rowsFrom(grid("Pikachu,Base,58,,,"), MAP);
    expect(rows[0]!.owned).toBe(true);
  });

  it("understands the ways people write no", () => {
    for (const no of ["false", "no", "N", "0", "wishlist", "wanted"]) {
      const { rows } = rowsFrom(grid(`Pikachu,Base,58,${no},,`), MAP);
      expect(rows[0]!.owned, `"${no}" should mean not owned`).toBe(false);
    }
  });

  it("treats anything else as owned", () => {
    for (const yes of ["true", "yes", "1", "x", "have"]) {
      const { rows } = rowsFrom(grid(`Pikachu,Base,58,${yes},,`), MAP);
      expect(rows[0]!.owned).toBe(true);
    }
  });

  it("skips a row with no set, and says which line", () => {
    // Counted rather than dropped: buildCollection cannot place it, so it would
    // be a card in the database and nowhere on screen.
    const { rows, skipped } = rowsFrom(grid("Pikachu,,58,,,"), MAP);
    expect(rows).toHaveLength(0);
    expect(skipped).toEqual([{ line: 2, why: "no set" }]);
  });

  it("skips a row with no name", () => {
    const { skipped } = rowsFrom(grid(",Base,58,,,"), MAP);
    expect(skipped).toEqual([{ line: 2, why: "no card name" }]);
  });

  it("counts the line as a person reading the file would", () => {
    const { skipped } = rowsFrom(grid("Pikachu,Base,1,,,", "Bad,,2,,,"), MAP);
    expect(skipped[0]!.line).toBe(3);
  });

  it("splits types on semicolons, not commas", () => {
    // The comma is the field separator, so a comma-separated types column would
    // already have been split into two fields by the parser.
    const { rows } = rowsFrom(grid("Pikachu,Base,58,,Fire;Water,"), MAP);
    expect(rows[0]!.types).toEqual(["Fire", "Water"]);
  });

  it("drops a date it cannot read rather than calling it today", () => {
    // The value history is built on this column. A wrong date is worse than a
    // missing one, because it is indistinguishable from a real one.
    const { rows } = rowsFrom(grid("Pikachu,Base,58,,,not a date"), MAP);
    expect(rows[0]!.acquiredAt).toBeNull();
  });

  it("keeps a date it can read", () => {
    const { rows } = rowsFrom(grid("Pikachu,Base,58,,,2019-04-02"), MAP);
    expect(rows[0]!.acquiredAt).toMatch(/^2019-04-02/);
  });

  it("ignores a blank line without calling it a mistake", () => {
    const { rows, skipped } = rowsFrom(grid("Pikachu,Base,58,,,", ",,,,,"), MAP);
    expect(rows).toHaveLength(1);
    expect(skipped).toEqual([]);
  });
});

/**
 * Every case here came from one real export, which named 137 variants of the
 * cards in a single collection. The job is to find the foil inside somebody
 * else's vocabulary — this app stores five finishes because that is the
 * distinction Cardmarket prices — and to drop the rest rather than guess.
 */
describe("finishFrom", () => {
  it("reads the three plain names", () => {
    expect(finishFrom("Normal")).toBe("normal");
    expect(finishFrom("Holo")).toBe("holo");
    expect(finishFrom("Reverse Holo")).toBe("reverse-holo");
  });

  it("reads a foil pattern as the holo it is", () => {
    // All of these are holo cards; the name is the pattern of the foil.
    for (const v of [
      "Cosmos Holo",
      "Cracked Ice Holo",
      "Starlight Holo",
      "Confetti Holo",
      "Vertical Line Holo",
    ]) {
      expect(finishFrom(v), v).toBe("holo");
    }
  });

  it("keeps reverse ahead of holo, whatever is bracketed after it", () => {
    expect(finishFrom("Reverse Holo (Cosmos)")).toBe("reverse-holo");
    expect(finishFrom("Reverse Holo (No e-Reader Logo)")).toBe("reverse-holo");
  });

  it("reads the ball patterns, on their own", () => {
    expect(finishFrom("Poké Ball")).toBe("poke-ball");
    expect(finishFrom("Poke Ball Reverse")).toBe("poke-ball");
    expect(finishFrom("Master Ball")).toBe("master-ball");
    expect(finishFrom("Master Ball Holo")).toBe("master-ball");
  });

  it("does not mistake a league named after a ball for a ball pattern", () => {
    // These are Play! Pokémon league promos. Matching them on their first two
    // words filed a stamped promo as the Master Ball reverse from 151, which
    // reads the foil price field.
    expect(finishFrom("Master Ball League")).toBeNull();
    expect(finishFrom("Master Ball League (Judge)")).toBeNull();
    expect(finishFrom("Ultra Ball League")).toBeNull();
    expect(finishFrom("Great Ball League")).toBeNull();
  });

  it("says nothing about where a card came from", () => {
    // Provenance, not foil: this app has nowhere to put it and a wrong finish
    // costs a wrong price.
    for (const v of [
      "Expansion Stamp",
      "1st Edition",
      "Play! Pokémon",
      "Professor Program",
      "Jumbo",
      "World Championships Deck 2024: Ancient Toolbox by Sakuya Ota",
    ]) {
      expect(finishFrom(v), v).toBeNull();
    }
  });

  it("says nothing for an empty column", () => {
    expect(finishFrom("")).toBeNull();
    expect(finishFrom("   ")).toBeNull();
  });
});

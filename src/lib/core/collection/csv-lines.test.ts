import { describe, expect, it } from "vitest";
import { parseCsv, rowsFrom, type ColumnMap } from "./csv";
import { dexRows, looksLikeDex } from "./dex";

/**
 * The line each row came from, which is the only name a row has that a preview
 * and the commit after it can both say. A client puts a tick beside a row and
 * hands the unticked lines back, so an alignment that slips by one does not
 * refuse an import: it silently writes a different card than the one somebody
 * chose.
 */

const MAP: ColumnMap = { name: 0, set: 1, number: 2, quantity: 3 };

describe("rowsFrom", () => {
  it("names the line each row came from, skipped lines and all", () => {
    const { rows, lines, skipped } = rowsFrom(
      parseCsv(
        [
          "Name,Set,Number,Quantity",
          "Pikachu,Base Set,58,1", // line 2
          ",Base Set,4,1", // line 3, no name
          "Charizard,Base Set,4,1", // line 4
          "Bulbasaur,Base Set,44,0", // line 5, not owned
          "Squirtle,Base Set,63,2", // line 6
        ].join("\n"),
      ),
      MAP,
    );

    expect(rows.map((r) => r.name)).toEqual(["Pikachu", "Charizard", "Squirtle"]);
    expect(lines).toEqual([2, 4, 6]);
    expect(skipped.map((s) => s.line)).toEqual([3, 5]);
  });

  it("hands back exactly the row a line names", () => {
    const parsed = rowsFrom(
      parseCsv(["Name,Set,Number,Quantity", "A,S,1,1", "B,S,2,1", "C,S,3,1"].join("\n")),
      MAP,
    );
    const kept = parsed.rows.filter((_, i) => parsed.lines[i] !== 3);

    expect(kept.map((r) => r.name)).toEqual(["A", "C"]);
  });
});

describe("dexRows", () => {
  it("names its lines too", () => {
    const grid = parseCsv(
      [
        "Type;Category;Locale;Series;Set;Id;Number;Name;Variant;Rarity;Illustrator;Quantity;Price",
        "collection;My Collection;International;Base;Base Set;bs-58;58/102;Pikachu;Normal;Common;Atsuko;1;€ 8,63", // line 2
        "collection;My Collection;International;Base;Base Set;bs-151;151/102;Mew;Normal;Rare;Atsuko;0;€ 1,00", // line 3, a checklist line
        "collection;Wishlist;International;Base;Base Set;bs-4;4/102;Charizard;Holo;Rare;Mitsuhiro;1;€ 300,00", // line 4
      ].join("\n"),
    );
    expect(looksLikeDex(grid[0]!)).toBe(true);

    const { rows, lines } = dexRows(grid);
    expect(rows.map((r) => r.name)).toEqual(["Pikachu", "Charizard"]);
    expect(lines).toEqual([2, 4]);
  });
});

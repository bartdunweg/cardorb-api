import { describe, expect, it } from "vitest";
import { looksLikeDex, dexRows } from "./dex";
import { parseCsv, sniffDelimiter } from "./csv";

/**
 * Lines lifted verbatim from a real export (dexcollection.csv, 4,536 rows), so
 * the awkward ones are the ones that were actually in the file rather than the
 * ones that were easy to imagine: an Espeon that exists four times over in four
 * printings, three of which are not owned; a wishlist row with a quantity of
 * zero; a set name with the era spelled into it; a promo set under a name the
 * catalogue does not use.
 */
const HEADER =
  "Type;Category;Locale;Series;Set;Id;Number;Name;Variant;Rarity;Illustrator;Quantity;Price;Note 1;Note 2;Note 3;Note 4;Note 5";

const row = (...fields: string[]) => fields.join(";");

const ESPEON_UNOWNED = row(
  "collection",
  "My Collection",
  "International",
  "Black & White",
  "Dark Explorers",
  "bw5-48",
  "48/108",
  "Espeon",
  "National Championships",
  "Rare",
  "Mizue",
  "0",
  "",
  "",
  "",
  "",
  "",
  "",
);
const ESPEON_NORMAL = row(
  "collection",
  "My Collection",
  "International",
  "Black & White",
  "Dark Explorers",
  "bw5-48",
  "48/108",
  "Espeon",
  "Normal",
  "Rare",
  "Mizue",
  "1",
  "€ 8,63",
  "",
  "",
  "",
  "",
  "",
);
const ESPEON_REVERSE_UNOWNED = row(
  "collection",
  "My Collection",
  "International",
  "Black & White",
  "Dark Explorers",
  "bw5-48",
  "48/108",
  "Espeon",
  "Reverse Holo",
  "Rare",
  "Mizue",
  "0",
  "€ 25,24",
  "",
  "",
  "",
  "",
  "",
);
const VAPOREON_WISHLIST = row(
  "standard",
  "Wishlist",
  "International",
  "EX",
  "EX Delta Species",
  "ex11-18",
  "18/113",
  "Vaporeon δ",
  "Expansion Stamp",
  "Holo Rare",
  "Kouki Saitou",
  "0",
  "€ 174,84",
  "",
  "",
  "",
  "",
  "",
);
const BANETTE_NEW_BUYS = row(
  "standard",
  "New buys",
  "International",
  "Mega Evolution",
  "Ascended Heroes",
  "me25-234",
  "234/217",
  "Banette",
  "Holo",
  "Illustration Rare",
  "YASHIRO Nanaco",
  "1",
  "€ 9,70",
  "",
  "",
  "",
  "",
  "",
);
const THREE_COPIES = row(
  "collection",
  "My Collection",
  "International",
  "Sword & Shield",
  "Evolving Skies",
  "swsh7-64",
  "064/203",
  "Umbreon",
  "Reverse Holo (Cosmos)",
  "Rare",
  "Saya Tsuruta",
  "3",
  "€ 4,00",
  "keeper",
  "",
  "",
  "",
  "",
);

const file = (...lines: string[]) => [HEADER, ...lines].join("\n");
const grid = (...lines: string[]) => parseCsv(file(...lines));

describe("looksLikeDex", () => {
  it("recognises the header Dex writes", () => {
    expect(looksLikeDex(parseCsv(file(ESPEON_NORMAL))[0]!)).toBe(true);
  });

  it("does not claim a file that merely has a set and a name", () => {
    expect(looksLikeDex(["Name", "Set", "Number", "Quantity"])).toBe(false);
  });

  it("still recognises a file with a column added on the end", () => {
    expect(looksLikeDex([...`${HEADER};Graded`.split(";")])).toBe(true);
  });
});

describe("dexRows", () => {
  it("drops the checklist lines and keeps the copies", () => {
    const { rows, skipped } = dexRows(grid(ESPEON_UNOWNED, ESPEON_NORMAL, ESPEON_REVERSE_UNOWNED));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Espeon", finish: "normal", quantity: 1, owned: true });
    expect(skipped).toEqual([
      { line: 2, why: "not owned (quantity 0)" },
      { line: 4, why: "not owned (quantity 0)" },
    ]);
  });

  it("strips the denominator off the printed number", () => {
    expect(dexRows(grid(ESPEON_NORMAL)).rows[0]!.number).toBe("48");
    expect(dexRows(grid(THREE_COPIES)).rows[0]!.number).toBe("064");
  });

  it("puts the wishlist folder on the wishlist, however many Dex counted", () => {
    const { rows, skipped } = dexRows(grid(VAPOREON_WISHLIST));

    expect(skipped).toEqual([]);
    expect(rows[0]).toMatchObject({ name: "Vaporeon δ", owned: false, quantity: 1 });
  });

  it("treats every other folder as cards you have", () => {
    expect(dexRows(grid(BANETTE_NEW_BUYS)).rows[0]).toMatchObject({
      name: "Banette",
      owned: true,
      finish: "holo",
    });
  });

  it("carries the copy count and reads a suffixed variant as its family", () => {
    expect(dexRows(grid(THREE_COPIES)).rows[0]).toMatchObject({
      quantity: 3,
      finish: "reverse-holo",
      notes: "keeper",
    });
  });

  it("keeps the era, the rarity and the set, and drops the price and the id", () => {
    expect(dexRows(grid(ESPEON_NORMAL)).rows[0]).toMatchObject({
      setName: "Dark Explorers",
      gen: "Black & White",
      rarity: "Rare",
      purchasePrice: null,
      types: [],
    });
  });

  it("reads the semicolons Dex writes without being told", () => {
    expect(sniffDelimiter(file(ESPEON_NORMAL))).toBe(";");
  });
});

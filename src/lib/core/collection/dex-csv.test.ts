import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { editionFrom } from "./csv";
import { dexRows, looksLikeDex } from "./dex";
import { dexCsv, priceWord, variantWord } from "./dex-export";
import type { CardItem } from "./items";

const item = (over: Partial<CardItem>): CardItem => ({
  id: "row-1",
  name: "Espeon",
  number: "48",
  set: "Dark Explorers",
  setTitle: "Dark Explorers",
  setAbbr: "DEX",
  rarity: "Rare",
  gen: "Black & White",
  type: "Psychic",
  image: null,
  imageHigh: null,
  speciesId: 196,
  localName: null,
  tcgId: "bw5-48",
  owned: true,
  finish: "normal",
  foilPattern: null,
  edition: null,
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  excluded: false,
  acquiredAt: null,
  collectionId: null,
  price: { nm: { mid: 8.63 } } as unknown as CardItem["price"],
  priceHolo: null,
  ...over,
});

describe("dexCsv", () => {
  it("writes Dex's header first, and this app's four columns after it", () => {
    const [header] = dexCsv([]).split("\r\n");
    expect(header).toBe(
      "Type;Category;Locale;Series;Set;Id;Number;Name;Variant;Rarity;Illustrator;Quantity;Price;Note 1;Note 2;Note 3;Note 4;Note 5;Condition;Language;Acquired;Purchase price;Edition",
    );
  });

  it("writes a held copy the way Dex does, the official set name and the count included", () => {
    const [, line] = dexCsv([item({ set: "Dark Explorers (BW5)", quantity: 3 })]).split("\r\n");
    expect(line).toBe(
      "collection;My Collection;International;Black & White;Dark Explorers;bw5-48;48;Espeon;Normal;Rare;;3;€ 8,63;;;;;;;;;;",
    );
  });

  it("files a wish under Dex's Wishlist folder, and the extra facts after Note 5", () => {
    const [, line] = dexCsv([
      item({
        owned: false,
        quantity: 1,
        condition: "Near Mint",
        language: "de",
        acquiredAt: "2023-09-15T00:00:00+00:00",
        purchasePrice: 4.5,
        notes: "Traded with Sam",
        finish: "reverse-holo",
        foilPattern: "cosmos",
        edition: "1st-edition",
        price: null,
      }),
    ]).split("\r\n");
    expect(line).toBe(
      "collection;Wishlist;International;Black & White;Dark Explorers;bw5-48;48;Espeon;Reverse Holo (Cosmos Holo);Rare;;1;—;Traded with Sam;;;;;Near Mint;de;2023-09-15;4,50;1st-edition",
    );
  });

  it("names the catalogue of a Japanese copy in Locale, as Dex does", () => {
    const [, line] = dexCsv([item({ language: "ja", tcgId: "sv2a-25" })]).split("\r\n");
    expect(line!.split(";")[2]).toBe("Japanese");
  });

  it("quotes a field with a semicolon, a quote or a line break in it", () => {
    const [, line] = dexCsv([item({ notes: 'Says "hi"; twice\nover' })]).split("\r\n");
    expect(line).toContain('"Says ""hi""; twice\nover"');
  });

  it("goes back in through the Dex reader unchanged", () => {
    const csv = dexCsv([
      item({
        quantity: 2,
        condition: "Near Mint",
        language: "de",
        acquiredAt: "2023-09-15T00:00:00+00:00",
        edition: "1st-edition",
      }),
      item({ id: "row-2", name: "Umbreon", number: "70", owned: false, tcgId: "bw5-70" }),
    ]);
    const grid = parseCsv(csv);
    expect(looksLikeDex(grid[0]!)).toBe(true);
    const { rows, skipped } = dexRows(grid);
    expect(skipped).toEqual([]);
    expect(
      rows.map((r) => [
        r.name,
        r.owned,
        r.quantity,
        r.finish,
        r.condition,
        r.language,
        r.acquiredAt,
        r.edition,
      ]),
    ).toEqual([
      ["Espeon", true, 2, "normal", "Near Mint", "de", "2023-09-15T00:00:00.000Z", "1st-edition"],
      ["Umbreon", false, 1, "normal", null, null, null, null],
    ]);
  });
});

describe("editionFrom", () => {
  it("reads the run out of Dex's variant word and out of a column of its own", () => {
    expect(editionFrom("1st Edition")).toBe("1st-edition");
    expect(editionFrom("1st Edition Holofoil")).toBe("1st-edition");
    expect(editionFrom("First Edition")).toBe("1st-edition");
    expect(editionFrom("Shadowless")).toBe("shadowless");
    expect(editionFrom("Unlimited Holofoil")).toBe("unlimited");
    expect(editionFrom("1st-edition")).toBe("1st-edition");
  });

  it("says nothing where nothing says it, and is not fooled by a nearby word", () => {
    expect(editionFrom("")).toBeNull();
    expect(editionFrom("Holo")).toBeNull();
    expect(editionFrom("Reverse Holo")).toBeNull();
    // A league promo, not a print run.
    expect(editionFrom("League Challenge (1st Place)")).toBeNull();
  });
});

describe("Dex's words", () => {
  it("writes the finish and the pattern as Dex spells them", () => {
    expect(variantWord("holo", null)).toBe("Holo");
    expect(variantWord("reverse-holo", "cracked-ice")).toBe("Reverse Holo (Cracked Ice Holo)");
    expect(variantWord("poke-ball", null)).toBe("Poké Ball Reverse");
    expect(variantWord(null, null)).toBe("");
  });

  it("writes a price with a comma and Dex's dash for none", () => {
    expect(priceWord(8.63)).toBe("€ 8,63");
    expect(priceWord(120)).toBe("€ 120,00");
    expect(priceWord(null)).toBe("—");
  });
});

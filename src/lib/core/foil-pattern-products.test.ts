import { describe, expect, it } from "vitest";
import {
  baseName,
  finishOfPrint,
  keyOf,
  patternOfName,
  patternPrintsOf,
} from "./foil-pattern-products.mjs";

const product = (productId: number, groupId: number, name: string, number?: string) => ({
  productId,
  groupId,
  name,
  extendedData: number ? [{ name: "Number", value: number }] : [],
});

describe("patternOfName", () => {
  it("reads TCGplayer's spellings of the two patterns the store records", () => {
    expect(patternOfName("Machamp 068/165 (Cosmos Holo)")).toEqual({
      foilPattern: "cosmos",
      reverse: false,
    });
    expect(patternOfName("Iono - 185/193 (Cosmo Foil)")?.foilPattern).toBe("cosmos");
    expect(patternOfName("Rayquaza C - 8/147 (Cracked Ice)")?.foilPattern).toBe("cracked-ice");
    expect(patternOfName("Bulbasaur - 001/165 (Reverse Cosmos Holo) (Costco Exclusive)")).toEqual({
      foilPattern: "cosmos",
      reverse: true,
    });
  });

  it("reads no pattern the store has no word for, and none from a card's own name", () => {
    expect(patternOfName("Solgaleo - 87/145 (Water Web Holo)")).toBeNull();
    expect(patternOfName("Exeggcute (Poke Ball Pattern)")).toBeNull();
    expect(patternOfName("Cosmog - 99/236")).toBeNull();
  });
});

describe("keyOf", () => {
  it("is one key for the plain product and its pattern print, whichever way the name is written", () => {
    expect(keyOf(product(1, 1, "Machamp 068/165", "068/165"))).toBe(
      keyOf(product(2, 2, "Machamp 068/165 (Cosmos Holo)", "068/165")),
    );
    expect(keyOf(product(1, 1, "Tepig (15)", "15/114"))).toBe(
      keyOf(product(2, 2, "Tepig 15/114 (Cosmos Holo)", "015/114")),
    );
    expect(baseName("Iono - 185/193 (Cosmo Foil)")).toBe("iono");
  });

  it("keeps two cards of one name apart by their number", () => {
    expect(keyOf(product(1, 1, "Tepig (15)", "15/114"))).not.toBe(
      keyOf(product(2, 1, "Tepig (16)", "16/114")),
    );
  });

  it("has no key without a printed number", () => {
    expect(keyOf(product(1, 1, "Darkness Energy (Prize Pack Series 3) (Cosmos Holo)"))).toBeNull();
  });
});

describe("finishOfPrint", () => {
  it("takes TCGplayer's priced subtype, and a reverse label over it", () => {
    expect(finishOfPrint(false, ["Holofoil"])).toEqual({ finish: "holo", printing: "holofoil" });
    expect(finishOfPrint(false, ["Reverse Holofoil"])).toEqual({
      finish: "reverse-holo",
      printing: "reverse-holofoil",
    });
    expect(finishOfPrint(true, ["Holofoil"]).finish).toBe("reverse-holo");
    expect(finishOfPrint(false, [])).toEqual({ finish: "holo", printing: "holofoil" });
  });
});

describe("patternPrintsOf", () => {
  const links = {
    "sv03.5-068": { productId: 516385 },
    "sv03.5-016": { productId: 86960 },
    "svp-025": { productId: 499996 },
    "bw7-9": { productId: 3001 },
    "sm1-9": { productId: 3002 },
  };
  const subtypes = new Map([[662070, ["Holofoil"]]]);

  it("matches a pattern print in another group by name and number, not by name", () => {
    const { cards } = patternPrintsOf(
      [
        product(516385, 23237, "Machamp 068/165", "068/165"),
        product(86960, 23237, "Machamp (16)", "016/165"),
        product(662070, 2374, "Machamp 068/165 (Cosmos Holo)", "068/165"),
      ],
      subtypes,
      links,
    );
    expect(cards).toEqual({
      "sv03.5-068": {
        prints: [
          { foilPattern: "cosmos", finish: "holo", printing: "holofoil", productId: 662070 },
        ],
      },
    });
  });

  it("matches a bare promo number only inside its own group", () => {
    const { cards, unmatched } = patternPrintsOf(
      [
        product(499996, 22872, "Tinkatink - 025 (Cosmo Holofoil)", "025"),
        product(7001, 9999, "Tinkatink - 025 (Cosmos Holo)", "025"),
      ],
      new Map(),
      links,
    );
    expect(cards["svp-025"]).toMatchObject({ standard: false });
    expect(cards["svp-025"]?.prints).toHaveLength(1);
    expect(unmatched.map((p) => p.productId)).toEqual([7001]);
  });

  it("matches nothing where two linked cards share the name and number", () => {
    const { cards, ambiguous } = patternPrintsOf(
      [
        product(3001, 10, "Rowlet", "009/149"),
        product(3002, 11, "Rowlet", "009/149"),
        product(8001, 2374, "Rowlet - 9/149 (Cosmos Holo)", "009/149"),
      ],
      new Map(),
      links,
    );
    expect(cards).toEqual({});
    expect(ambiguous.map((p) => p.productId)).toEqual([8001]);
  });
});

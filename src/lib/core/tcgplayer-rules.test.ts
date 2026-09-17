import { describe, expect, it } from "vitest";
import CLASSIC_NUMBERS from "./catalogue/classic-collection-numbers.generated.json";
import {
  classicCollectionNumbers,
  numberDisagrees,
  printedNumberOfProduct,
  stageDisagrees,
  typesDisagree,
  typesOfCardType,
  tcgplayerRarity,
} from "./tcgplayer-rules.mjs";

const product = (number?: string, rarity?: string) => ({
  extendedData: [
    ...(number === undefined ? [] : [{ name: "Number", value: number }]),
    ...(rarity === undefined ? [] : [{ name: "Rarity", value: rarity }]),
  ],
});

describe("printedNumberOfProduct", () => {
  it("reads TCGplayer's Number, trimmed", () => {
    expect(printedNumberOfProduct(product(" 4/102 "))).toBe("4/102");
    expect(printedNumberOfProduct(product())).toBeNull();
    expect(printedNumberOfProduct(null)).toBeNull();
  });
});

describe("numberDisagrees", () => {
  it("reads one number whichever way it is padded, prefixed or totalled", () => {
    expect(numberDisagrees("001", "1/102")).toBe(false);
    expect(numberDisagrees("XY67a", "XY67a")).toBe(false);
    expect(numberDisagrees("175", "SVP 175")).toBe(false);
    expect(numberDisagrees("?", "?/28")).toBe(false);
    expect(numberDisagrees("TG01", "TG01/TG30")).toBe(false);
  });

  it("holds a printed total to the label's own total where the label has one", () => {
    expect(numberDisagrees("4/102", "4/102")).toBe(false);
    expect(numberDisagrees("106/106", "106/160")).toBe(true);
  });

  it("names a number that is another card's", () => {
    expect(numberDisagrees("001", "4/102")).toBe(true);
    expect(numberDisagrees("CC002", "4/102")).toBe(true);
  });

  it("says nothing where TCGplayer prints no number", () => {
    expect(numberDisagrees("1", null)).toBe(false);
  });
});

describe("classicCollectionNumbers", () => {
  const cards = (setId: string, pairs: [string, string | null][]) => ({
    id: setId,
    cards: pairs.map(([localId, number]) => ({ id: `${setId}-${localId}`, localId, number })),
  });

  it("takes the printed numbers of a set whose cards print other cards' numbers", () => {
    const set = cards("30th-c", [
      ["001", "4/102"],
      ["002", "5/109"],
      ["003", "11/113"],
      ["004", "11/101"],
      ["005", "18/132"],
    ]);
    expect(classicCollectionNumbers([set])).toEqual({
      "30th-c-001": "4/102",
      "30th-c-002": "5/109",
      "30th-c-003": "11/113",
      "30th-c-004": "11/101",
      "30th-c-005": "18/132",
    });
  });

  it("takes every card of such a set, one whose reprint shares its number too", () => {
    const set = cards("cc", [
      ["001", "4/102"],
      ["002", "5/102"],
      ["003", "15/102"],
      ["004", "4/130"],
      ["005", "8/64"],
      ["006", "9/102"],
      ["007", "10/102"],
      ["008", "12/64"],
      ["009", "14/62"],
      ["010", "16/102"],
    ]);
    expect(classicCollectionNumbers([set])["cc-004"]).toBe("4/130");
  });

  it("leaves a set alone where a single product carries another number (a TCGplayer slip)", () => {
    const set = cards("tk-xy-n", [
      ["1", "1/30"],
      ["2", "2/30"],
      ["3", "3/30"],
      ["4", "4/30"],
      ["5", "5/30"],
      ["29", "4/30"],
    ]);
    expect(classicCollectionNumbers([set])).toEqual({});
  });

  it("needs enough printed numbers to call a set one", () => {
    expect(classicCollectionNumbers([cards("x", [["1", "4/102"]])])).toEqual({});
  });

  it("never reads a number without a total as another card's", () => {
    const set = cards("svp", [
      ["175", "SVP 175"],
      ["176", "SVP 176"],
      ["177", "SVP177"],
      ["178", "178"],
      ["179", "179"],
    ]);
    expect(classicCollectionNumbers([set])).toEqual({});
  });

  it("writes the numbers the committed file holds, 55 of them", () => {
    expect(Object.keys(CLASSIC_NUMBERS)).toHaveLength(55);
  });
});

describe("tcgplayerRarity", () => {
  it("takes TCGplayer's word where TCGdex names none", () => {
    expect(tcgplayerRarity(null, "Classic Collection")).toBe("Classic Collection");
    expect(tcgplayerRarity(null, "Common")).toBe("Common");
  });

  it("takes TCGplayer's grade where TCGdex says a plain Rare of a holo or higher card", () => {
    expect(tcgplayerRarity("Rare", "Holo Rare")).toBe("Holo Rare");
    expect(tcgplayerRarity("Rare", "Ultra Rare")).toBe("Ultra Rare");
    expect(tcgplayerRarity("Rare", "Secret Rare")).toBe("Secret Rare");
  });

  it("keeps TCGdex's word everywhere else", () => {
    expect(tcgplayerRarity("Rare", "Prism Rare")).toBe("Rare");
    expect(tcgplayerRarity("Rare", "Rare Ace")).toBe("Rare");
    expect(tcgplayerRarity("Illustration Rare", "Ultra Rare")).toBe("Illustration Rare");
    expect(tcgplayerRarity(null, "Unconfirmed")).toBeNull();
    expect(tcgplayerRarity(null, null)).toBeNull();
    expect(tcgplayerRarity("Rare", undefined)).toBe("Rare");
  });
});

describe("typesDisagree", () => {
  it("reads TCGplayer's card type as TCGdex's types, in any order and spelling", () => {
    expect(typesDisagree(["Lightning", "Metal"], "Metal Lightning")).toBe(false);
    expect(typesDisagree(["Darkness", "Darkness"], "Dark")).toBe(false);
    expect(typesDisagree(["Colorless"], "Normal")).toBe(false);
    expect(typesDisagree(["Lightning"], "Lighnting")).toBe(false);
    expect(typesDisagree(["Psychic"], "Darkness Psychic")).toBe(true);
    expect(typesDisagree(["Metal"], "Colorless")).toBe(true);
  });

  it("gives no answer for a trainer or energy word, no type from TCGplayer or none stored", () => {
    expect(typesDisagree(["Fairy"], "Basic Energy")).toBe(false);
    expect(typesDisagree([], "Fire")).toBe(false);
    expect(typesDisagree(["Fire"], null)).toBe(false);
    expect(typesOfCardType("Trainer - Item")).toBeNull();
  });
});

describe("stageDisagrees", () => {
  it("reads TCGplayer's stage words as TCGdex's", () => {
    expect(stageDisagrees("Stage1", "Stage 1")).toBe(false);
    expect(stageDisagrees("LEVEL-UP", "Level Up")).toBe(false);
    expect(stageDisagrees("MEGA", "Primal")).toBe(false);
    expect(stageDisagrees("Baby", "Basic")).toBe(false);
    // 30th Classic Collection's Solgaleo-GX, copied as a Basic (2026-09-17).
    expect(stageDisagrees("Basic", "Stage 2")).toBe(true);
    expect(stageDisagrees("Basic", "Legend")).toBe(true);
  });

  it("gives no answer for no stage on either side or a word that is none", () => {
    expect(stageDisagrees(null, "Basic")).toBe(false);
    expect(stageDisagrees("Basic", null)).toBe(false);
    expect(stageDisagrees("Basic", "Item")).toBe(false);
  });
});

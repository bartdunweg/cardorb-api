import { describe, expect, it } from "vitest";
import { CARD_FACT_CORRECTIONS, correctedFacts } from "./card-fact-corrections";

describe("correctedFacts", () => {
  it("gives a Best of Game card its type and rarity where TCGdex has none", () => {
    expect(correctedFacts("bog-2", { rarity: "None", types: [] })).toEqual({
      rarity: "Promo",
      types: ["Fighting"],
    });
  });

  it("replaces a type TCGdex has wrong, whatever order it lists types in", () => {
    expect(correctedFacts("ex7-5", { rarity: "Holo Rare", types: ["Darkness"] }).types).toEqual([
      "Fire",
      "Darkness",
    ]);
  });

  it("does nothing once TCGdex says something else, so a fix upstream wins", () => {
    expect(correctedFacts("bog-2", { rarity: "Rare", types: ["Fighting"] })).toEqual({
      rarity: "Rare",
      types: ["Fighting"],
    });
    expect(correctedFacts("base1-4", { rarity: "Holo Rare", types: ["Fire"] })).toEqual({
      rarity: "Holo Rare",
      types: ["Fire"],
    });
  });

  it("never corrects to nothing, and keeps to the words TCGdex uses", () => {
    for (const fix of Object.values(CARD_FACT_CORRECTIONS)) {
      if (fix.rarity)
        expect([
          "Common",
          "Uncommon",
          "Rare",
          "Promo",
          "Holo Rare",
          "Ultra Rare",
          "Secret Rare",
        ]).toContain(fix.rarity[1]);
      if (fix.types) expect(fix.types[1].length).toBeGreaterThan(0);
    }
  });
});

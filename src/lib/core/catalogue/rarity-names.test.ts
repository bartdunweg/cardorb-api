import { describe, expect, it } from "vitest";
import { canonicalRarity, englishRarity, languageRarity } from "./rarity-names";

describe("canonicalRarity", () => {
  it("spells Scarlet & Violet's rarities in title case and a holo as Holo Rare", () => {
    expect(canonicalRarity("Illustration rare")).toBe("Illustration Rare");
    expect(canonicalRarity("special illustration rare")).toBe("Special Illustration Rare");
    expect(canonicalRarity("Rare Holo")).toBe("Holo Rare");
    expect(canonicalRarity("Rare Holo LV.X")).toBe("Holo Rare LV.X");
  });

  it("leaves a word it has no other spelling for, and nothing as nothing", () => {
    expect(canonicalRarity("Secret Rare")).toBe("Secret Rare");
    expect(canonicalRarity("レア")).toBe("レア");
    expect(canonicalRarity(null)).toBeNull();
  });
});

describe("englishRarity", () => {
  it("corrects an old holo TCGdex calls Rare, then spells it", () => {
    expect(englishRarity("base1-1", "Rare")).toBe("Holo Rare");
    expect(englishRarity("sv01-1", "Illustration rare")).toBe("Illustration Rare");
  });
});

describe("languageRarity", () => {
  it("spells TCGplayer's Kagayaku as Radiant Rare", () => {
    expect(languageRarity("Kagayaku")).toBe("Radiant Rare");
  });

  it("stores no rarity and the word None alike, as None", () => {
    expect(languageRarity("None")).toBe("None");
    expect(languageRarity("")).toBe("None");
    expect(languageRarity(null)).toBe("None");
  });

  // SV4a-264 Klefki: TCGdex's record has no rarity, TCGplayer's product says Shiny Rare.
  it("takes the product's rarity where the record has none", () => {
    expect(languageRarity(undefined, "Shiny Rare")).toBe("Shiny Rare");
    expect(languageRarity("Double rare", "Ultra Rare")).toBe("Double Rare");
    expect(languageRarity("None", "None")).toBe("None");
  });
});

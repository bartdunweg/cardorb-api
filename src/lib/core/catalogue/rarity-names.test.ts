import { describe, expect, it } from "vitest";
import { MARK_RARITY, canonicalRarity, japaneseRarity, japaneseRarityWord } from "./rarity-names";
import RARITY_WORDS from "./rarity-words.json";

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

describe("japaneseRarity", () => {
  it("writes the printed mark as its long form", () => {
    // SM2p-050 Tapu Bulu GX prints SR; TCGdex said Ultra Rare.
    expect(japaneseRarity({ mark: "SR", tcgplayer: "Super Rare", tcgdex: "Ultra Rare" })).toBe(
      "Super Rare",
    );
    expect(japaneseRarity({ mark: "SAR", tcgdex: "Special Illustration Rare" })).toBe(
      "Special Art Rare",
    );
    expect(japaneseRarity({ mark: "AR", tcgdex: "Illustration Rare" })).toBe("Art Rare");
    expect(japaneseRarity({ mark: "SSR" })).toBe("Shiny Super Rare");
    expect(japaneseRarity({ mark: "●" })).toBe("Common");
    expect(japaneseRarity({ mark: "★H" })).toBe("Holo Rare");
    expect(japaneseRarity({ mark: "れじぇんど" })).toBe("LEGEND");
  });

  it("has no rarity for a card that prints no mark, never the word None", () => {
    // SV4a-190 Luminous Energy and SM2p-049 Olivia print none.
    expect(japaneseRarity({ mark: "none", tcgplayer: "None", tcgdex: "None" })).toBeNull();
    expect(japaneseRarity({ mark: "none", tcgplayer: "Common" })).toBeNull();
    expect(japaneseRarity({ tcgplayer: "None", tcgdex: "None" })).toBeNull();
    expect(japaneseRarity({})).toBeNull();
  });

  it("takes TCGplayer's word where Scrydex misreads a whole run", () => {
    // Shiny Star V's shiny cards print S; Scrydex records R.
    expect(japaneseRarity({ mark: "R", tcgplayer: "Shiny Rare" })).toBe("Shiny Rare");
    expect(japaneseRarity({ mark: "none", tcgplayer: "Trainer Rare" })).toBe("Trainer Rare");
    expect(japaneseRarity({ mark: "none", tcgplayer: "Kagayaku" })).toBe("Radiant Rare");
    expect(japaneseRarity({ mark: "R", tcgplayer: "Rare" })).toBe("Rare");
  });

  it("falls back to TCGplayer's word, then TCGdex's, where Scrydex does not have the card", () => {
    expect(japaneseRarity({ tcgplayer: "Shiny Secret Rare", tcgdex: "Rare" })).toBe(
      "Shiny Super Rare",
    );
    expect(japaneseRarity({ tcgdex: "Double rare" })).toBe("Double Rare");
  });

  it("only ever answers a word of the one list", () => {
    for (const printed of Object.values(MARK_RARITY))
      if (printed) expect(RARITY_WORDS.ja).toContain(printed);
    for (const word of [
      "Kagayaku",
      "Shiny Secret Rare",
      "ACE Rare",
      "Illustration Rare",
      "Rare Holo LEGEND",
    ])
      expect(RARITY_WORDS.ja).toContain(japaneseRarityWord(word));
  });
});

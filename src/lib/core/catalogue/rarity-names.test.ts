import { describe, expect, it } from "vitest";
import { MARK_RARITY, canonicalRarity, japaneseRarity, japaneseRarityWord } from "./rarity-names";
import RARITY_WORDS from "./rarity-words.json";
import EXTRA_CARDS from "./extra-cards.json";
import { NEVER_FILLS, SAYS_MORE } from "../japanese-rarity-rules.mjs";

describe("canonicalRarity", () => {
  it("spells Scarlet & Violet's rarities in title case and a holo as Holo Rare", () => {
    expect(canonicalRarity("Illustration rare")).toBe("Illustration Rare");
    expect(canonicalRarity("special illustration rare")).toBe("Special Illustration Rare");
    expect(canonicalRarity("Rare Holo")).toBe("Holo Rare");
    expect(canonicalRarity("Rare Holo LV.X")).toBe("Holo Rare LV.X");
  });

  it("holds 30th Celebration's own rarities as words of their own (owner, 2026-09-17)", () => {
    // Pikachu 023 to 052 (Bulbapedia's Pikachu rare cards); Mewtwo ex 157/128 and Mew ex 158/128.
    // R/RGB, G/RGB and B/RGB Mew print a red, green and blue roundel, not a Holo Rare's star.
    for (const word of ["Pikachu Rare", "Futuristic Rare", "RGB Rare"]) {
      expect(RARITY_WORDS.en).toContain(word);
      expect(canonicalRarity(word)).toBe(word);
    }
  });

  it("leaves a word it has no other spelling for, and nothing as nothing", () => {
    expect(canonicalRarity("Secret Rare")).toBe("Secret Rare");
    expect(canonicalRarity("レア")).toBe("レア");
    expect(canonicalRarity(null)).toBeNull();
  });
});

describe("the three R/G/B Mew", () => {
  it("carry the rarity their symbol stands for, not TCGplayer's fallback", () => {
    for (const id of ["30th-R", "30th-G", "30th-B"])
      expect(EXTRA_CARDS.en[id as keyof typeof EXTRA_CARDS.en]).toMatchObject({
        rarity: "RGB Rare",
      });
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
    // M2a-232 Mega Dragonite ex prints MA; Scrydex records no mark.
    expect(japaneseRarity({ mark: "none", tcgplayer: "Mega Attack Rare" })).toBe(
      "Mega Attack Rare",
    );
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

describe("a Japanese card that prints no mark", () => {
  it("keeps no rarity, whatever TCGplayer files it under (owner, 2026-09-17)", () => {
    for (const word of NEVER_FILLS)
      expect(japaneseRarity({ mark: "none", tcgplayer: word, tcgdex: word })).toBeNull();
  });

  it("still takes a word that says more than no mark", () => {
    expect(japaneseRarity({ mark: "none", tcgplayer: "Radiant Rare" })).toBe("Radiant Rare");
  });

  it("names no word both as a default and as one that says more", () => {
    for (const word of NEVER_FILLS) expect(SAYS_MORE.has(word)).toBe(false);
  });
});

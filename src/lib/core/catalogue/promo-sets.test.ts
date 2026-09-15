import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import EXTRA_CARDS from "./extra-cards.json";
import { PROMO_SETS, isPromoSet, promoRarity } from "./promo-sets";

describe("isPromoSet", () => {
  it("knows the English and Japanese promo sets and nothing else", () => {
    expect(isPromoSet("svp")).toBe(true);
    expect(isPromoSet("basep")).toBe(true);
    expect(isPromoSet("SV-P")).toBe(true);
    expect(isPromoSet("M-P")).toBe(true);
    expect(isPromoSet("sv03.5")).toBe(false);
    // The McDonald's sets are corrected to Promo card by card, not by set.
    expect(isPromoSet("2011bw")).toBe(false);
    // The Japanese ids are upper case in TCGdex, and a lower-case one is another id.
    expect(isPromoSet("sv-p")).toBe(false);
    expect(isPromoSet("")).toBe(false);
    expect(isPromoSet(null)).toBe(false);
    expect(isPromoSet(undefined)).toBe(false);
  });
});

describe("promoRarity", () => {
  it("answers Promo for any card of a promo set, whatever the rarity given", () => {
    expect(promoRarity("svp-085", "Illustration Rare")).toBe("Promo");
    expect(promoRarity("smp-SM167", null)).toBe("Promo");
    expect(promoRarity("smp-167", "Ultra Rare")).toBe("Promo");
    // The set is everything before the last dash, so a Japanese promo is not read as set "SV".
    expect(promoRarity("SV-P-051", "Rare")).toBe("Promo");
    expect(promoRarity("M-P-001", null)).toBe("Promo");
  });

  it("leaves the rarity of every other card as it was", () => {
    expect(promoRarity("sv03.5-100", "Holo Rare")).toBe("Holo Rare");
    expect(promoRarity("2011bw-1", "Promo")).toBe("Promo");
    expect(promoRarity("base1-4", null)).toBeNull();
    expect(promoRarity("svp", "Rare")).toBe("Rare");
    expect(promoRarity(null, "Rare")).toBe("Rare");
    expect(promoRarity(undefined, null)).toBeNull();
  });
});

describe("PROMO_SETS", () => {
  it("is the list the data health run checks the copy against", () => {
    // scripts/data-health.mjs is plain JavaScript and keeps its own copy of the list.
    const script = readFileSync(join(__dirname, "../../../../scripts/data-health.mjs"), "utf8");
    const listed = /const PROMO_SETS = \[([^\]]*)\]/.exec(script)?.[1];
    expect(listed).toBeDefined();
    const ids = [...(listed ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([...PROMO_SETS]);
  });

  it("holds every card the copy adds to a promo set to Promo too", () => {
    // extra-cards.json is written into the copy through writeCatalogueSet(), which says Promo
    // anyway; the live read of a set the copy lacks takes its word as it is.
    for (const cards of Object.values(EXTRA_CARDS) as Record<string, { rarity?: string | null }>[])
      for (const [id, card] of Object.entries(cards))
        if (promoRarity(id, null)) expect([id, card.rarity]).toEqual([id, "Promo"]);
  });
});

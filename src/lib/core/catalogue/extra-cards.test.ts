import { describe, expect, it } from "vitest";
import { EXTRA_CARDS, extraCardsOf } from "./extra-cards";
import { nameConventions } from "./english-card-name.mjs";
import { printedCode } from "./mirror-language";
import TCGPLAYER_EN from "../tcgplayer-ids.generated.json";
import TCGPLAYER_JA from "../tcgplayer-ids.ja.generated.json";

describe("extra-cards.json", () => {
  it("files each card under its set and number, named in the copy's conventions", () => {
    for (const language of ["en", "ja"] as const)
      for (const [id, card] of Object.entries(EXTRA_CARDS[language])) {
        expect(id).toBe(`${card.set}-${card.number}`);
        expect(nameConventions(card.name)).toBe(card.name);
        expect(card.image || card.product).toBeTruthy();
      }
  });

  it("links each card's product in the price map the prices are read from", () => {
    const en = TCGPLAYER_EN as Record<string, { productId: number } | null>;
    const ja = TCGPLAYER_JA as Record<string, number | null>;
    for (const [id, card] of Object.entries(EXTRA_CARDS.en))
      if (card.product) expect(en[id]?.productId).toBe(card.product);
    for (const [id, card] of Object.entries(EXTRA_CARDS.ja))
      if (card.product) expect(ja[id]).toBe(card.product);
  });

  it("adds the Sun & Moon Yellow A cards to the sets they print, and the pack Energy under their code", () => {
    expect(extraCardsOf("en", "sm2").map(([id]) => id)).toContain("sm2-60a");
    expect(extraCardsOf("en", "smp").map(([id]) => id)).toEqual(
      expect.arrayContaining(["smp-SM30a", "smp-SM103a", "smp-SM104a"]),
    );
    expect(extraCardsOf("ja", "SM12a").map(([id]) => id)).toContain("SM12a-GRA");
    expect(extraCardsOf("en", "xya")).toEqual([]);
  });
});

describe("printedCode", () => {
  it("reads a pack Energy's printed code where the copy held Scrydex's number", () => {
    expect(printedCode("S8b-286", "286", "Grass Energy", true)).toBe("GRA");
    expect(printedCode("SM1p-070", "070", "Fire Energy", true)).toBe("FIR");
    // TCGdex's own numbered Energy, and a secret rare that prints its number, keep theirs.
    expect(printedCode("SM12a-202", "202", "Grass Energy", false)).toBe("202");
    expect(printedCode("L1a-072", "072", "Grass Energy", true)).toBe("072");
  });
});

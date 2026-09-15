import { describe, expect, it } from "vitest";
import type { CardSet } from "./cards";
import { holdStrayPrices } from "./held-prices";
import type { CardPricePoint } from "./movers";

const charizard = {
  key: "Base Set-4-Charizard",
  tcgId: "base1-4",
  price: { market: 752 },
  priceFirstEd: null,
  pricePrintings: {
    holofoil: { market: 752 },
    "1st-edition-holofoil": { market: 216.5 },
    "shadowless-holofoil": { market: 1953 },
  },
};
const set = (language = "en") =>
  ({ name: "Base Set", language, cards: [charizard] }) as unknown as CardSet;

// 2026-07-15: TCGplayer's 1st Edition figure $250, the line holding €8,745 over €219.
const point: CardPricePoint = {
  language: "en",
  tcgId: "base1-4",
  date: "2026-07-15",
  market: 690,
  holo: 690,
  printings: { holofoil: 690, "1st-edition-holofoil": 8745, "shadowless-holofoil": 1850 },
  held: { "1st-edition-holofoil": 219 },
};

describe("holdStrayPrices", () => {
  it("holds a printing's price where the line holds its figure, at today's rate", () => {
    const [out] = holdStrayPrices([set()], [point], "2026-07-15");
    const card = out!.cards[0]!;
    expect(card.pricePrintings?.["1st-edition-holofoil"]).toEqual({ market: 8645.17 });
    // The other printings and the card's own price are not stray, and stand.
    expect(card.pricePrintings?.holofoil).toEqual({ market: 752 });
    expect(card.price).toEqual({ market: 752 });
  });

  it("leaves the prices where the line's last day is another day than the prices'", () => {
    const sets = [set()];
    expect(holdStrayPrices(sets, [point], "2026-07-16")).toBe(sets);
  });

  it("leaves a Japanese card under the same id alone", () => {
    const sets = [set("ja")];
    expect(holdStrayPrices(sets, [point], "2026-07-15")[0]).toBe(sets[0]);
  });

  it("holds the card's own price with the printing it is", () => {
    const own = { ...charizard, price: { market: 216.5 } };
    const sets = [{ ...set(), cards: [own] }] as unknown as CardSet[];
    const card = holdStrayPrices(sets, [point], "2026-07-15")[0]!.cards[0]!;
    expect(card.price).toEqual({ market: 8645.17 });
  });
});

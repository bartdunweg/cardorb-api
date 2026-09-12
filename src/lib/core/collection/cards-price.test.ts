/**
 * What a card is worth, and which market said so.
 *
 * The Near Mint calibration this file opened with is gone with the band it measured: seven
 * Cardmarket product pages read by hand on 5 August 2026, which fitted a ratio to Cardmarket's
 * trend. Nothing reads that trend any more (see price-basis.mjs), and a band measured against
 * one market is not evidence about another. What is left here is the part that still decides
 * money: which of a card's figures a copy reads, and that a card nobody prices has no price.
 */

import { describe, expect, it } from "vitest";
import { holoPriceOf, priceOf, shownPrice } from "./cards";
import { copyPriceOf, priceFromMarket, priceFromUsd, printingPriceOf } from "../price-basis.mjs";
import { usdFirstEdOf, usdOf } from "../catalogue/tcgdex-client";

describe("priceOf", () => {
  // The band that used to sit on top of this is gone, so the guide's own market figure is the
  // whole of what it answers. Kept as a test because the guide still feeds the price history
  // until the cron reads TCGplayer too, and a band creeping back in would be silent money.
  it("never invents a Near Mint range on top of the market figure", () => {
    expect(priceOf({ low: 145.0, trend: 191.47, avg30: 233.33 })?.nm).toBeNull();
    expect(priceOf({ low: 5.0, trend: 8.64, avg30: 8.5 })?.nm).toBeNull();
    expect(shownPrice(priceOf({ low: 0.02, trend: 0.45, avg30: 0.41 }))).toBe(0.45);
  });

  it("has nothing to show for a card nobody has listed", () => {
    expect(shownPrice(null)).toBeNull();
  });

  it("shows the floor only when it is the only number there is", () => {
    expect(shownPrice(priceOf({ low: 1.2, trend: null, avg30: null }))).toBe(1.2);
    expect(shownPrice(priceOf({ low: 1.2, trend: 3.4, avg30: 3.1 }))).not.toBe(1.2);
  });
  it("keeps the low as a floor rather than as the price", () => {
    const price = priceOf({ low: 45.0, trend: 72.65, avg30: 66.74 });
    expect(price?.low).toBe(45.0);
    expect(price?.market).toBe(72.65);
  });

  // SVP 159 Magneton: one €10,000 sale in the chart put the trend at €801 for a
  // card listed at €70. Believing that would have made it the dearest card on
  // the page by a factor of four.
  it("disbelieves a trend wrecked by a single sale", () => {
    const price = priceOf({ low: 8.0, trend: 801.13, avg30: 391.26 });
    expect(price?.market).toBe(391.26);
  });

  // e-Card Machamp: Cardmarket files the reverse holo under the same product, so
  // the trend is drawn from two different cards.
  it("disbelieves a trend drawn from two printings", () => {
    const price = priceOf({ low: 2.5, trend: 145.5, avg30: 79.23 });
    expect(price?.market).toBe(79.23);
  });

  it("leaves a trend alone when the month agrees with it", () => {
    const price = priceOf({ low: 1.0, trend: 12.58, avg30: 11.81 });
    expect(price?.market).toBe(12.58);
  });

  it("falls back to the month where there is no trend at all", () => {
    expect(priceOf({ low: 1.0, trend: null, avg30: 9.0 })?.market).toBe(9.0);
  });

  // A card TCGdex knows but has never seen listed is unknown, not free.
  it("is null where nothing has been published", () => {
    expect(priceOf({ low: null, trend: null, avg30: null })).toBeNull();
  });
});

describe("holoPriceOf", () => {
  it("reads the foil fields, not the plain ones", () => {
    const p = holoPriceOf({
      low: 1,
      trend: 2,
      avg30: 2,
      "low-holo": 10,
      "trend-holo": 20,
      "avg30-holo": 20,
    });
    expect(p?.market).toBe(20);
    expect(p?.low).toBe(10);
  });

  it("treats zero as no price rather than as free", () => {
    // The trap this function exists for. 865 of this collection's 1,526
    // products answer `trend-holo: 0`, which is Cardmarket saying it has no
    // foil listing. Read literally it values a reverse holo at nothing, which
    // is worse than the approximation it was meant to replace.
    expect(holoPriceOf({ "low-holo": 0, "trend-holo": 0, "avg30-holo": 0 })).toBeNull();
  });

  it("is null where the foil fields are absent altogether", () => {
    expect(holoPriceOf({ low: 5, trend: 5, avg30: 5 })).toBeNull();
  });

  it("ignores a zero on one field without discarding a real price on another", () => {
    const p = holoPriceOf({ "low-holo": 0, "trend-holo": 12, "avg30-holo": 12 });
    expect(p?.market).toBe(12);
    expect(p?.low).toBeNull();
  });
});

describe("priceFromUsd", () => {
  it("turns TCGplayer's dollars into euros to the cent, market as the price, low as the floor", () => {
    const p = priceFromUsd({ market: 12.34, low: 9.99 }, 0.92)!;
    expect(p.market).toBe(11.35);
    expect(p.low).toBe(9.19);
    expect(p.nm).toBeNull();
    expect(shownPrice(p)).toBe(11.35);
  });
  it("is nothing when TCGplayer has nothing", () => {
    expect(priceFromUsd({ market: null, low: null }, 0.92)).toBeNull();
  });
});

describe("priceFromMarket", () => {
  const cm = priceOf({ low: 8, trend: 10, avg30: 10 });
  const tp = priceFromUsd({ market: 11, low: 9 }, 1);

  it("is TCGplayer's figure, untouched by the other market", () => {
    const p = priceFromMarket(cm, tp)!;
    expect(p.market).toBe(11);
    expect(p.low).toBe(9);
    expect(shownPrice(p)).toBe(11);
  });

  // The whole point of the change. A card Cardmarket prices at €30.46 off a product it shares
  // with the holo, and TCGplayer does not price at all, used to read €30.46. It now reads
  // nothing, and the screen says so.
  it("is nothing where TCGplayer says nothing, however much the other market says", () => {
    expect(priceFromMarket(cm, null)).toBeNull();
    expect(priceFromMarket(priceOf({ low: 30.46, trend: 30.46, avg30: 30.46 }), null)).toBeNull();
    expect(priceFromMarket(null, null)).toBeNull();
  });
});

/**
 * Which series a copy reads, in the one place that says so.
 *
 * The numbers are TCGdex's for Neo Genesis Lugia (neo1-9) on 2026-09-12: $1,085.03 as a 1st
 * Edition holo and $518.99 as an unlimited one. They are here because the pair is the whole
 * argument for the rule: a figure from one run standing in for the other is wrong by more
 * than twice.
 */
describe("copyPriceOf", () => {
  const card = {
    price: { low: 1, market: 10, avg30: 10, nm: null },
    priceFirstEd: { low: 3, market: 30, avg30: 30, nm: null },
  };

  it("reads the stamped run's price for a 1st Edition copy, whatever its finish", () => {
    expect(copyPriceOf({ edition: "1st-edition", finish: "holo" }, card)).toBe(card.priceFirstEd);
    expect(copyPriceOf({ edition: "1st-edition", finish: "reverse-holo" }, card)).toBe(
      card.priceFirstEd,
    );
  });

  // The run's own figure was Cardmarket's, and it left with Cardmarket: base1-4 Charizard was
  // €3,567 on its Shadowless product against €583 on the ordinary one, read 2026-09-12.
  // TCGplayer does not separate the run in what TCGdex relays, so a Shadowless copy reads the
  // ordinary price and is understated. Held here so the day someone wires tcgcsv's Shadowless
  // products in, this test is what they change.
  it("reads the ordinary price for a Shadowless copy, the run having no figure of its own", () => {
    expect(copyPriceOf({ edition: "shadowless", finish: "holo" }, card)).toBe(card.price);
  });

  it("falls back to the ordinary price for a run nothing prices apart", () => {
    const plain = { price: card.price };
    expect(copyPriceOf({ edition: "shadowless", finish: "holo" }, plain)).toBe(card.price);
    expect(copyPriceOf({ edition: "1st-edition", finish: "holo" }, plain)).toBe(card.price);
  });

  // The foil used to have a series of its own here, out of Cardmarket's `-holo` fields. It is
  // TCGplayer's printings that tell a foil from the plain card now, and they are read above:
  // what is left on the card itself is one figure, whatever the finish.
  it("reads the card's own figure for every finish, the foil series having gone", () => {
    expect(copyPriceOf({ finish: "reverse-holo" }, card)).toBe(card.price);
    expect(copyPriceOf({ finish: "poke-ball" }, card)).toBe(card.price);
    expect(copyPriceOf({ finish: "holo" }, card)).toBe(card.price);
    expect(copyPriceOf({ finish: null, edition: "unlimited" }, card)).toBe(card.price);
  });

  it("falls back to the ordinary price where no stamped figure exists", () => {
    expect(copyPriceOf({ edition: "1st-edition" }, { price: card.price })).toBe(card.price);
    expect(copyPriceOf({ edition: "1st-edition" }, { price: null })).toBeNull();
  });
});

describe("TCGplayer's two runs", () => {
  const lugia = {
    "1st-edition-holofoil": { marketPrice: 1085.03, lowPrice: 2999.99 },
    "unlimited-holofoil": { marketPrice: 518.99, lowPrice: 434.85 },
  };

  it("takes the ordinary run for the card's own price", () => {
    expect(usdOf(lugia)?.market).toBe(518.99);
  });

  it("takes the stamped run only where it is asked for", () => {
    expect(usdFirstEdOf(lugia)?.market).toBe(1085.03);
    expect(usdFirstEdOf({ holofoil: { marketPrice: 12 } })).toBeNull();
    expect(usdFirstEdOf(null)).toBeNull();
  });
});

/**
 * Which printing of TCGplayer's a copy reads.
 *
 * The market that tells a holo from the plain card: a Jungle Scyther is two printings there and
 * one product on Cardmarket, which is how a holo copy read the plain rare's figure.
 */
describe("printingKeysOf and printingPriceOf", () => {
  const eur = (n: number) => ({ low: null, market: n, avg30: null, nm: null });
  const jungleScyther = { holofoil: eur(53.23), normal: eur(15.19) };

  it("reads the foil the copy is, not whichever printing came first", () => {
    expect(printingPriceOf({ finish: "holo" }, jungleScyther)?.market).toBe(53.23);
    expect(printingPriceOf({ finish: "normal" }, jungleScyther)?.market).toBe(15.19);
  });

  it("puts the run before the foil, and the ordinary run first where nobody has said", () => {
    const runs = { "1st-edition-holofoil": eur(145.91), "unlimited-holofoil": eur(53.23) };
    expect(printingPriceOf({ finish: "holo", edition: "1st-edition" }, runs)?.market).toBe(145.91);
    expect(printingPriceOf({ finish: "holo", edition: "unlimited" }, runs)?.market).toBe(53.23);
    // A copy that says nothing about its run is the ordinary one, as everywhere else.
    expect(printingPriceOf({ finish: "holo" }, runs)?.market).toBe(53.23);
  });

  // A copy nobody has classified is every row in this collection until somebody fills it in,
  // and cards-stats.test.ts already says it "must not silently claim the foil price". Through
  // TCGplayer's printings it did: a card priced as normal and reverse-holofoil handed an
  // unclassified copy the reverse's figure, because the foil keys came before "normal". A
  // modern common reads a reverse at several times its plain price, so every unclassified copy
  // of one was being counted at the reverse's.
  it("reads the plain printing for a copy whose finish nobody has said, never a reverse", () => {
    const modern = { normal: eur(0.25), "reverse-holofoil": eur(1.4) };
    expect(printingPriceOf({ finish: null }, modern)?.market).toBe(0.25);
    expect(printingPriceOf({}, modern)?.market).toBe(0.25);
    // A card that exists only as a holo: the plain card is the holo, so that is its price.
    expect(printingPriceOf({ finish: null }, { holofoil: eur(53.23) })?.market).toBe(53.23);
    // And a card TCGplayer prices only as a reverse has nothing to say about the plain copy.
    expect(printingPriceOf({ finish: null }, { "reverse-holofoil": eur(1.4) })).toBeNull();
  });

  it("falls back through less and less of what it knows, and then answers nothing", () => {
    expect(printingPriceOf({ finish: "reverse-holo" }, { holofoil: eur(9) })?.market).toBe(9);
    expect(printingPriceOf({ finish: "holo" }, {})).toBeNull();
    expect(printingPriceOf({ finish: "holo" }, null)).toBeNull();
  });

  it("is the first thing copyPriceOf reads, and the card's own figure answers where it is silent", () => {
    const card = { price: eur(20.72), pricePrintings: jungleScyther };
    expect(copyPriceOf({ finish: "holo" }, card)?.market).toBe(53.23);
    expect(copyPriceOf({ finish: "holo" }, { price: eur(20.72) })?.market).toBe(20.72);
  });
});

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
import { shownPrice } from "./cards";
import {
  copyPriceOf,
  displayedPrice,
  pointFromTcgplayer,
  priceFromUsd,
  pricedPrintingOf,
  printingKeysOf,
  printingPriceOf,
  shelfFigureOf,
  isPrintRun,
  judgedFigure,
  MARKET_UNDER_LISTING_RATIO,
  PLACEHOLDER_LISTING_RATIO,
} from "../price-basis.mjs";
import { usdFigureOf, usdFirstEdOf, usdOf, usdPrintingsOf } from "../catalogue/tcgdex-client";

describe("shownPrice", () => {
  it("is the market figure", () => {
    expect(shownPrice({ market: 0.45 })).toBe(0.45);
  });

  it("has nothing to show for a card nobody prices", () => {
    expect(shownPrice(null)).toBeNull();
    expect(shownPrice(undefined)).toBeNull();
    expect(shownPrice({ market: null })).toBeNull();
  });
});

describe("priceFromUsd", () => {
  it("turns TCGplayer's market figure into euros to the cent", () => {
    const p = priceFromUsd({ market: 12.34 }, 0.92)!;
    expect(p).toEqual({ market: 11.35, basis: "market" });
    expect(shownPrice(p)).toBe(11.35);
  });

  it("is nothing when TCGplayer has neither a market figure nor a listing", () => {
    expect(priceFromUsd({ market: null }, 0.92)).toBeNull();
    expect(priceFromUsd({ market: null, listing: null }, 0.92)).toBeNull();
    expect(priceFromUsd({ market: null, listing: 0 }, 0.92)).toBeNull();
  });

  /* Bart, 2026-09-18: a printing listed and never sold shows its lowest listing, labelled. The
     three R/G/B Mew of 30th Celebration (products 717607 to 717609) had no market figure and
     $6,789.99 to $9,000 asked, and showed no price at all. */
  it("is the lowest listing, labelled, where TCGplayer has no market figure", () => {
    const p = priceFromUsd({ market: null, listing: 6789.99 }, 0.85)!;
    expect(p).toEqual({ market: null, lowestListing: 5771.49, basis: "lowest-listing" });
    // Shown, never summed: a total and a sort read the market figure alone.
    expect(displayedPrice(p)).toBe(5771.49);
    expect(shownPrice(p)).toBeNull();
  });

  it("is the market figure wherever there is one, whatever the listing", () => {
    expect(priceFromUsd({ market: 10, listing: 4 }, 1)).toEqual({ market: 10, basis: "market" });
  });
});

describe("shelfFigureOf", () => {
  it("keeps the market figure and drops the listing beside it", () => {
    expect(shelfFigureOf({ marketPrice: 12, lowPrice: 9 })).toEqual({ market: 12, listing: null });
  });

  it("keeps the lowest listing where tcgcsv publishes no market figure", () => {
    // Group 24722 on 2026-09-18: Mew - R/RGB.
    expect(shelfFigureOf({ marketPrice: null, lowPrice: 6789.99 })).toEqual({
      market: null,
      listing: 6789.99,
    });
  });

  it("leaves out a row with neither", () => {
    expect(shelfFigureOf({ marketPrice: null, lowPrice: null })).toBeNull();
    expect(shelfFigureOf({ marketPrice: 0, lowPrice: 0 })).toBeNull();
  });
});

/* TCGplayer's figures for 2026-09-28, tcgcsv group files: the market figure against the printing's
   own cheapest listing. Ids invented; the numbers are real. */
const TEAM_ROCKET_DARK_CHARIZARD_1ST = { marketPrice: 121.94, lowPrice: 980 };
const TEAM_ROCKET_DARK_CHARIZARD_UNLIMITED = { marketPrice: 381.69, lowPrice: 274.99 };
const NEO_GENESIS_LUGIA_1ST = { marketPrice: 164.8, lowPrice: 2999.99 };
const NEO_DESTINY_DARK_PORYGON2_1ST = { marketPrice: 39.21, lowPrice: 6999.99 };
const NEO_DESTINY_DARK_AMPHAROS_1ST = { marketPrice: 120, lowPrice: 249.98 };
// A plain holo on the same day, market far under its cheapest copy: not a run, so believed.
const EX_POWER_KEEPERS_HOLO = { marketPrice: 1399.95, lowPrice: 99999.98 };

describe("a print run's market figure under half its own cheapest listing", () => {
  it("is judged on the runs alone: 1st Edition and Shadowless", () => {
    expect(isPrintRun("1st-edition-holofoil")).toBe(true);
    expect(isPrintRun("1st-edition")).toBe(true);
    expect(isPrintRun("shadowless-holofoil")).toBe(true);
    for (const printing of ["unlimited-holofoil", "holofoil", "reverse-holofoil", "normal"])
      expect(isPrintRun(printing)).toBe(false);
    expect(MARKET_UNDER_LISTING_RATIO).toBe(0.5);
    expect(PLACEHOLDER_LISTING_RATIO).toBe(10);
  });

  it("is priced at the listing where the listing is at most ten times it", () => {
    expect(shelfFigureOf(TEAM_ROCKET_DARK_CHARIZARD_1ST, true)).toEqual({
      market: null,
      listing: 980,
      disbelieved: { market: 121.94, listing: 980 },
    });
    expect(judgedFigure(120, 249.98, true)).toMatchObject({ market: null, listing: 249.98 });
    expect(judgedFigure(100, 1000, true)).toMatchObject({ market: null, listing: 1000 });
  });

  it("has no price at all where the listing is more than ten times it", () => {
    expect(shelfFigureOf(NEO_GENESIS_LUGIA_1ST, true)).toEqual({
      market: null,
      listing: null,
      disbelieved: { market: 164.8, listing: 2999.99 },
    });
    expect(shelfFigureOf(NEO_DESTINY_DARK_PORYGON2_1ST, true)).toMatchObject({
      market: null,
      listing: null,
    });
  });

  it("is believed at half the listing or over, and with no listing to hold it against", () => {
    expect(judgedFigure(50, 100, true)).toEqual({ market: 50, listing: null });
    expect(judgedFigure(49.99, 100, true)).toMatchObject({ market: null, listing: 100 });
    expect(judgedFigure(12, null, true)).toEqual({ market: 12, listing: null });
  });

  it("leaves every other printing's market figure as it was", () => {
    expect(shelfFigureOf(EX_POWER_KEEPERS_HOLO)).toEqual({ market: 1399.95, listing: null });
    expect(shelfFigureOf(TEAM_ROCKET_DARK_CHARIZARD_UNLIMITED)).toEqual({
      market: 381.69,
      listing: null,
    });
    expect(shelfFigureOf(TEAM_ROCKET_DARK_CHARIZARD_1ST)).toEqual({
      market: 121.94,
      listing: null,
    });
  });

  it("is read the same when it comes in live, from TCGdex's relay or a group file", () => {
    const tp = {
      "1st-edition-holofoil": { ...TEAM_ROCKET_DARK_CHARIZARD_1ST, productId: 2 },
      "unlimited-holofoil": { ...TEAM_ROCKET_DARK_CHARIZARD_UNLIMITED, productId: 2 },
    };
    expect(usdFirstEdOf(tp)).toEqual({ market: null, listing: 980, productId: 2 });
    expect(usdPrintingsOf(tp)["1st-edition-holofoil"]).toEqual({
      market: null,
      listing: 980,
      productId: 2,
    });
    expect(usdOf(tp)).toEqual({ market: 381.69, productId: 2 });
    const lugia = { "1st-edition-holofoil": { ...NEO_GENESIS_LUGIA_1ST, productId: 3 } };
    expect(usdFirstEdOf(lugia)).toBeNull();
    expect(usdPrintingsOf(lugia)).toEqual({});
    expect(usdFigureOf({ ...NEO_DESTINY_DARK_AMPHAROS_1ST, productId: 4 }, "holofoil")).toEqual({
      market: 120,
      productId: 4,
    });
  });

  it("leaves a zero market figure as it always read", () => {
    expect(usdFigureOf({ marketPrice: 0, lowPrice: 5 })).toEqual({ market: 0, productId: null });
  });
});

describe("the lowest listing on a copy", () => {
  const listed = (n: number) => ({
    market: null,
    lowestListing: n,
    basis: "lowest-listing" as const,
  });
  const market = (n: number) => ({ market: n, basis: "market" as const });

  it("never stands in where any printing the copy reads has a market figure", () => {
    // A holo copy reads its holo printing first, then the plain card: a market figure on the plain
    // card wins over a listing on the holo, as it did before listings came back.
    const card = { price: market(3), pricePrintings: { holofoil: listed(50), normal: market(3) } };
    expect(copyPriceOf({ finish: "holo", edition: null }, card)).toEqual(market(3));
    expect(pricedPrintingOf({ finish: "holo", edition: null }, card.pricePrintings)).toBe("normal");
  });

  it("is the copy's price where nothing it reads has a market figure", () => {
    const card = { price: listed(7000), pricePrintings: { holofoil: listed(7000) } };
    expect(copyPriceOf({ finish: "holo", edition: null }, card)).toEqual(listed(7000));
    expect(pricedPrintingOf({ finish: "holo", edition: null }, card.pricePrintings)).toBe(
      "holofoil",
    );
  });

  it("keeps a reverse on its own printing: another printing's listing is not its price", () => {
    const card = { price: market(1), pricePrintings: { normal: market(1), holofoil: listed(9) } };
    expect(copyPriceOf({ finish: "reverse-holo", edition: null }, card)).toBeNull();
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
    price: { market: 10 },
    priceFirstEd: { market: 30 },
  };

  it("reads the stamped run's price for a 1st Edition copy", () => {
    expect(copyPriceOf({ edition: "1st-edition", finish: "holo" }, card)).toBe(card.priceFirstEd);
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
  it("reads the card's own figure for a plain finish, the foil series having gone", () => {
    expect(copyPriceOf({ finish: "holo" }, card)).toBe(card.price);
    expect(copyPriceOf({ finish: null, edition: "unlimited" }, card)).toBe(card.price);
  });

  // Bart, 2026-09-14: a missing price shows as unknown, never as another printing's. The card's
  // own figure and the stamped run's are the plain card's, so a reverse reads neither.
  it("leaves a reverse unpriced where no reverse figure exists", () => {
    expect(copyPriceOf({ finish: "reverse-holo" }, card)).toBeNull();
    expect(copyPriceOf({ finish: "poke-ball" }, card)).toBeNull();
    expect(copyPriceOf({ edition: "1st-edition", finish: "reverse-holo" }, card)).toBeNull();
    const priced = { ...card, pricePrintings: { normal: { market: 10 } } };
    expect(copyPriceOf({ finish: "reverse-holo" }, priced)).toBeNull();
    const reverse = { ...card, pricePrintings: { "reverse-holofoil": { market: 12 } } };
    expect(copyPriceOf({ finish: "reverse-holo" }, reverse)?.market).toBe(12);
  });

  it("falls back to the ordinary price where no stamped figure exists", () => {
    expect(copyPriceOf({ edition: "1st-edition" }, { price: card.price })).toBe(card.price);
    expect(copyPriceOf({ edition: "1st-edition" }, { price: null })).toBeNull();
  });
});

describe("TCGplayer's two runs", () => {
  const lugia = {
    "1st-edition-holofoil": { marketPrice: 1085.03 },
    "unlimited-holofoil": { marketPrice: 518.99 },
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
  const eur = (n: number) => ({ market: n });

  // Prismatic Evolutions Eevee, 2026-09-14, in dollars: plain reverse 0.29, Poké Ball 1.50, Master Ball 18.63.
  it("reads a Poké Ball, Master Ball or Energy Symbol reverse's own product before the plain reverse", () => {
    const eevee = {
      normal: eur(0.24),
      "reverse-holofoil": eur(0.29),
      "poke-ball-reverse-holofoil": eur(1.5),
      "master-ball-reverse-holofoil": eur(18.63),
    };
    expect(printingKeysOf({ finish: "energy-symbol" })[0]).toBe("energy-symbol-reverse-holofoil");
    // A Blue Border copy reads its own run first, then the plain card.
    expect(printingKeysOf({ finish: "normal", edition: "blue-border" }).slice(0, 2)).toEqual([
      "blue-border-normal",
      "blue-border",
    ]);
    expect(printingPriceOf({ finish: "poke-ball" }, eevee)?.market).toBe(1.5);
    expect(printingPriceOf({ finish: "master-ball" }, eevee)?.market).toBe(18.63);
    expect(printingPriceOf({ finish: "reverse-holo" }, eevee)?.market).toBe(0.29);
    expect(
      printingPriceOf(
        { finish: "friend-ball" },
        { ...eevee, "friend-ball-reverse-holofoil": eur(0.74) },
      )?.market,
    ).toBe(0.74);
    // A print with no figure of its own is unpriced: the plain reverse is another printing.
    expect(printingPriceOf({ finish: "energy-symbol" }, eevee)).toBeNull();
  });
  const jungleScyther = { holofoil: eur(53.23), normal: eur(15.19) };

  it("reads the foil the copy is, not whichever printing came first", () => {
    expect(printingPriceOf({ finish: "holo" }, jungleScyther)?.market).toBe(53.23);
    expect(printingPriceOf({ finish: "normal" }, jungleScyther)?.market).toBe(15.19);
  });

  it("prices a reverse from the reverse holofoil before the run's plain printing", () => {
    const printings = { unlimited: eur(3), "reverse-holofoil": eur(9) };
    expect(printingPriceOf({ finish: "reverse-holo" }, printings)?.market).toBe(9);
    expect(printingPriceOf({ finish: "normal" }, printings)?.market).toBe(3);
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

  // Base Set Charizard on tcgcsv, 2026-09-12: TCGplayer files the Shadowless run as a group of
  // its own, whose "Unlimited Holofoil" is the Shadowless holo at $2,257.87, beside the ordinary
  // card's $869.02. tcgplayer-links.mjs files that printing as "shadowless-holofoil".
  it("reads the Shadowless run for a Shadowless copy, and the ordinary card where there is none", () => {
    const charizard = {
      holofoil: eur(869.02),
      "shadowless-holofoil": eur(2257.87),
      "1st-edition-holofoil": eur(10000),
    };
    expect(printingPriceOf({ finish: "holo", edition: "shadowless" }, charizard)?.market).toBe(
      2257.87,
    );
    expect(printingPriceOf({ finish: "holo", edition: "1st-edition" }, charizard)?.market).toBe(
      10000,
    );
    expect(printingPriceOf({ finish: "holo" }, charizard)?.market).toBe(869.02);
    expect(
      printingPriceOf({ finish: "holo", edition: "shadowless" }, { holofoil: eur(869.02) })?.market,
    ).toBe(869.02);
  });

  it("falls back through less and less of what it knows, and then answers nothing", () => {
    // A reverse never reads the holo or the plain card (e-Card Eevee, ecard3-54: TCGplayer lists
    // "Normal" only, so its reverse is unpriced rather than the normal card's figure).
    expect(printingPriceOf({ finish: "reverse-holo" }, { holofoil: eur(9) })).toBeNull();
    expect(
      printingPriceOf({ finish: "reverse-holo" }, { normal: eur(2), unlimited: eur(2) }),
    ).toBeNull();
    expect(printingPriceOf({ finish: "holo" }, {})).toBeNull();
    expect(printingPriceOf({ finish: "holo" }, null)).toBeNull();
  });

  it("is the first thing copyPriceOf reads, and the card's own figure answers where it is silent", () => {
    const card = { price: eur(20.72), pricePrintings: jungleScyther };
    expect(copyPriceOf({ finish: "holo" }, card)?.market).toBe(53.23);
    expect(copyPriceOf({ finish: "holo" }, { price: eur(20.72) })?.market).toBe(20.72);
  });
});

/**
 * Which of TCGplayer's printings, as tcgcsv names them, a price history point reads.
 *
 * The subtype names are tcgcsv's own, read off their groups on 2026-09-12: Base Set answers
 * "Normal" and "Holofoil", Jungle and Neo Genesis answer "Unlimited", "1st Edition" and their
 * holofoil pairs, a modern set answers "Normal" and "Reverse Holofoil".
 */
describe("pointFromTcgplayer", () => {
  const of = (o: Record<string, number>) => new Map(Object.entries(o));

  it("reads the plain printing for the market series and the foil for the holo one", () => {
    expect(pointFromTcgplayer(of({ Normal: 0.25, "Reverse Holofoil": 1.4 }))).toEqual({
      market: 0.25,
      holo: 1.4,
    });
  });

  it("takes the ordinary run before the stamped one, on a set printed twice", () => {
    const jungle = of({
      Unlimited: 15.19,
      "1st Edition": 40,
      "Unlimited Holofoil": 53.23,
      "1st Edition Holofoil": 145.91,
    });
    expect(pointFromTcgplayer(jungle)).toEqual({ market: 15.19, holo: 53.23 });
  });

  // The same rule the nightly point follows (cardPricesFromSets): a card that exists only as a
  // holo is its holo, on both lines, so the chart does not start blank for Base Set Charizard.
  it("gives a holo-only card its holo figure as the market too", () => {
    expect(pointFromTcgplayer(of({ Holofoil: 869.02 }))).toEqual({ market: 869.02, holo: 869.02 });
  });

  it("is nothing where TCGplayer has no market figure at all", () => {
    expect(pointFromTcgplayer(of({}))).toBeNull();
    expect(pointFromTcgplayer(undefined)).toBeNull();
  });
});

describe("usdOf and usdPrintingsOf with a lowest listing", () => {
  it("take a market figure on any printing over a listing on an earlier one", () => {
    const tp = {
      normal: { marketPrice: null, lowPrice: 20, productId: 1 },
      holofoil: { marketPrice: 5, productId: 1 },
    };
    expect(usdOf(tp)).toEqual({ market: 5, productId: 1 });
  });

  it("take the listing where no printing has a market figure", () => {
    const tp = { holofoil: { marketPrice: null, lowPrice: 8000, productId: 717609 } };
    expect(usdOf(tp)).toEqual({ market: null, listing: 8000, productId: 717609 });
    expect(usdPrintingsOf(tp)).toEqual({
      holofoil: { market: null, listing: 8000, productId: 717609 },
    });
  });

  it("never carry a listing beside a market figure", () => {
    const tp = { normal: { marketPrice: 2, lowPrice: 1, productId: 3 } };
    expect(usdPrintingsOf(tp)).toEqual({ normal: { market: 2, productId: 3 } });
  });
});

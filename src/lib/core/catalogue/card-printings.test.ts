import { describe, expect, it } from "vitest";
import {
  editionsOf,
  finishPrintsFor,
  foilPatternsOfSerie,
  patternPrintsFor,
  pricesPlainReverse,
  reverseHoloExists,
  printingsOf,
} from "./card-printings";

describe("printingsOf", () => {
  it("is nothing where TCGdex lists no variants, which is no answer rather than none", () => {
    expect(printingsOf(undefined)).toEqual([]);
    expect(printingsOf([])).toEqual([]);
  });

  it("reads a promo that exists as one plain printing", () => {
    expect(printingsOf([{ type: "normal" }])).toEqual([{ finish: "normal", foilPattern: null }]);
  });

  it("names the foil where TCGdex names it", () => {
    expect(printingsOf([{ type: "holo", foil: "cosmos" }])).toEqual([
      { finish: "holo", foilPattern: "cosmos" },
    ]);
  });

  it("makes the ball prints finishes of their own, which is the column that prices them", () => {
    expect(
      printingsOf([
        { type: "normal" },
        { type: "reverse" },
        { type: "reverse", foil: "pokeball" },
        { type: "reverse", foil: "masterball" },
      ]),
    ).toEqual([
      { finish: "normal", foilPattern: null },
      { finish: "reverse-holo", foilPattern: null },
      { finish: "poke-ball", foilPattern: null },
      { finish: "master-ball", foilPattern: null },
    ]);
  });

  // What TCGdex lists for these cards in our copy, 2026-09-14, beside what TCGplayer sells.
  it("offers the ball and Energy Symbol reverses TCGplayer sells, and none it does not", () => {
    // Prismatic Evolutions Eevee: TCGplayer sells both balls, as TCGdex says.
    expect(
      printingsOf(
        [
          { type: "normal" },
          { type: "reverse" },
          { type: "reverse", foil: "pokeball" },
          { type: "reverse", foil: "masterball" },
        ],
        "sv08.5-074",
      ).map((p) => p.finish),
    ).toEqual(["normal", "reverse-holo", "poke-ball", "master-ball"]);
    // Scarlet & Violet Energies' Grass Energy: TCGdex names a Poké Ball reverse TCGplayer never sold.
    expect(
      printingsOf(
        [
          { type: "normal" },
          { type: "reverse", foil: "cosmos" },
          { type: "reverse", foil: "pokeball" },
        ],
        "sve-001",
      ),
    ).toEqual([
      { finish: "normal", foilPattern: null },
      { finish: "reverse-holo", foilPattern: "cosmos" },
    ]);
    // Ascended Heroes Pikachu: a Friend Ball and an Energy Symbol reverse, and no plain one.
    expect(
      printingsOf(
        [
          { type: "normal" },
          { type: "reverse", foil: "friendball" },
          { type: "reverse", foil: "energy" },
        ],
        "me02.5-055",
      ).map((p) => p.finish),
    ).toEqual(["normal", "energy-symbol", "friend-ball"]);
    // Erika's Oddish: a Poké Ball and an Energy Symbol reverse, and no plain reverse at all.
    expect(
      printingsOf(
        [
          { type: "normal" },
          { type: "reverse", foil: "pokeball" },
          { type: "reverse", foil: "energy" },
        ],
        "me02.5-001",
      ).map((p) => p.finish),
    ).toEqual(["normal", "poke-ball", "energy-symbol"]);
  });

  it("keeps the ex era's energy foil a plain reverse, and TCGdex's word where there is no link", () => {
    expect(printingsOf([{ type: "reverse", foil: "energy" }], "ex5-1")).toEqual([
      { finish: "reverse-holo", foilPattern: null },
    ]);
    expect(printingsOf([{ type: "reverse", foil: "pokeball" }], null)).toEqual([
      { finish: "poke-ball", foilPattern: null },
    ]);
  });

  // What TCGdex lists for these cards in our copy, 2026-09-15.
  it("offers only the reverse holo of a card printed as nothing else", () => {
    for (const id of ["bwp-BW41", "bwp-BW42", "bwp-BW52"])
      expect(printingsOf([{ type: "normal" }], id)).toEqual([
        { finish: "reverse-holo", foilPattern: null },
      ]);
    for (const id of ["dp7-SH1", "dp7-SH2", "dp7-SH3"])
      expect(printingsOf([{ type: "holo" }], id)).toEqual([
        { finish: "reverse-holo", foilPattern: null },
      ]);
    // Landorus BW43, from the same box, is a full art holo and keeps it.
    expect(printingsOf([{ type: "holo" }], "bwp-BW43").map((p) => p.finish)).toEqual(["holo"]);
  });

  // TCGdex lists these as normal only (2026-09-15); TCGplayer and Scrydex both sell and show a holo.
  it("offers the holo, not a Standard copy, of a holo TCGdex lists as normal", () => {
    // Reshiram, Black & White's Ultra Rare: one printing, the holo.
    expect(printingsOf([{ type: "normal" }], "bw1-113").map((p) => p.finish)).toEqual(["holo"]);
    // Emboar, a Holo Rare: the holo beside the plain print its theme deck had, and the reverse.
    expect(printingsOf([{ type: "normal" }], "bw1-19").map((p) => p.finish)).toEqual([
      "normal",
      "reverse-holo",
      "holo",
    ]);
    // Snivy, a common: stays plain.
    expect(printingsOf([{ type: "normal" }], "bw1-1").map((p) => p.finish)).toEqual([
      "normal",
      "reverse-holo",
    ]);
  });

  // Added from TCGplayer's own products (extra-cards.json), with no variants at TCGdex.
  it("offers a card TCGdex lists no variants for what its own TCGplayer product sells", () => {
    // Choice Band 121a, North America Championships: a reverse holo only.
    expect(printingsOf([], "sm2-121a").map((p) => p.finish)).toEqual(["reverse-holo"]);
    // Jirachi GX 79a, an alternate print: the holo.
    expect(printingsOf([], "sm11-79a").map((p) => p.finish)).toEqual(["holo"]);
    // A trainer kit's Fighting Energy: plain.
    expect(printingsOf(undefined, "tk-sm-l-2").map((p) => p.finish)).toEqual(["normal"]);
    // A product that lists nothing yet stays no answer.
    expect(printingsOf([], "mep-089")).toEqual([]);
  });

  // Skyridge Gengar (ecard3-10): TCGdex and Scrydex list a reverse and Bulbapedia says every Skyridge
  // card but the H cards has one; TCGplayer prices the card as Normal only. The reverse is offered,
  // and priced as unknown (price-basis.mjs).
  it("offers a plain reverse where the witnesses decided one exists, priced or not", () => {
    const plain = [{ type: "normal" }, { type: "reverse" }];
    expect(reverseHoloExists("ecard3-10")).toBe(true);
    expect(pricesPlainReverse("ecard3-10")).toBe(false);
    expect(printingsOf(plain, "ecard3-10").map((p) => p.finish)).toEqual([
      "normal",
      "reverse-holo",
    ]);
    // Expedition Grass Energy: TCGdex lists a reverse; TCGplayer, Scrydex and Bulbapedia do not.
    expect(printingsOf(plain, "ecard1-160").map((p) => p.finish)).toEqual(["normal"]);
    // Black & White Snivy: TCGdex lists no reverse for the whole set, TCGplayer and Scrydex do.
    expect(printingsOf([{ type: "normal" }], "bw1-1").map((p) => p.finish)).toEqual([
      "normal",
      "reverse-holo",
    ]);
    // Southern Islands Mew, sold before reverse holos existed: TCGdex's reverse is its holo.
    expect(printingsOf([{ type: "reverse" }], "si1-1")).toEqual([
      { finish: "holo", foilPattern: null },
    ]);
    // No card id, or one the evidence run never saw: TCGdex's word, less what TCGplayer rules out.
    expect(printingsOf(plain, null).map((p) => p.finish)).toEqual(["normal", "reverse-holo"]);
    expect(reverseHoloExists("no-such-card")).toBeNull();
    expect(pricesPlainReverse("sv08.5-074")).toBe(true);
    expect(pricesPlainReverse("no-such-card")).toBe(true);
  });

  it("adds no TCGplayer reverse to a card TCGdex lists no printings for", () => {
    expect(printingsOf([], "sv08.5-074")).toEqual([]);
  });

  it("keeps the finish a foil it has no word for proves, and not the word", () => {
    expect(printingsOf([{ type: "reverse", foil: "league" }])).toEqual([
      { finish: "reverse-holo", foilPattern: null },
    ]);
  });

  it("counts a shop's stamp as the printing it is stamped on, once", () => {
    expect(printingsOf([{ type: "normal" }, { type: "normal", stamp: ["gamestop"] }])).toEqual([
      { finish: "normal", foilPattern: null },
    ]);
  });

  it("leaves out a printing this app does not model", () => {
    expect(printingsOf([{ type: "wPromo" }, { type: "normal" }])).toEqual([
      { finish: "normal", foilPattern: null },
    ]);
  });
});

describe("editionsOf", () => {
  it("says nothing where TCGdex did not say whether a stamped run exists", () => {
    expect(editionsOf("base1-4", null)).toBeNull();
    expect(editionsOf("base1-4", undefined)).toBeNull();
  });

  it("offers Base Set all three, Shadowless included", () => {
    expect(editionsOf("base1-4", true)).toEqual(["1st-edition", "shadowless", "unlimited"]);
  });

  // Machamp came only in the two-player starter, stamped: TCGplayer sells a 1st Edition Holofoil and
  // nothing unstamped, where TCGdex lists an unlimited variant too. TCGplayer decides.
  it("offers Machamp its stamped runs and no unlimited one, because none was printed", () => {
    expect(editionsOf("base1-8", true)).toEqual(["1st-edition", "shadowless"]);
  });

  it("offers Shadowless where TCGplayer has a product for the run, and not otherwise", () => {
    expect(editionsOf("base1-4", true)).toContain("shadowless");
    expect(editionsOf("base1-999", true)).toEqual(["1st-edition", "unlimited"]);
  });

  // My First Battle Pikachu: TCGplayer sells the plain card and "Pikachu (Blue Border)" apart
  // ($17.56 and $29.58 on 2026-09-15); Charmeleon had no Blue Border print.
  it("offers a Blue Border run where TCGplayer sells one, beside the plain card", () => {
    expect(editionsOf("mfb-17", null)).toEqual(["unlimited", "blue-border"]);
    expect(editionsOf("mfb-32", null)).toEqual(["unlimited", "blue-border"]);
    expect(editionsOf("mfb-10", null)).toBeNull();
  });

  it("reads a stamped run from TCGplayer where TCGdex said nothing", () => {
    expect(editionsOf("base2-10", null)).toEqual(["1st-edition", "unlimited"]);
  });

  it("offers a Jungle card its two runs, because no Shadowless Jungle was printed", () => {
    expect(editionsOf("base2-1", true)).toEqual(["1st-edition", "unlimited"]);
  });

  it("offers a card printed once the one run it had", () => {
    expect(editionsOf("sv01-001", false)).toEqual(["unlimited"]);
  });
});

describe("foilPatternsOfSerie", () => {
  it("offers no pattern on a Wizards card, whose holo had its set's one foil", () => {
    for (const serie of ["base", "gym", "neo", "lc", "ecard"])
      expect(foilPatternsOfSerie(serie)).toEqual([]);
  });

  it("has no answer for any later series, or a series nobody could find", () => {
    expect(foilPatternsOfSerie("ex")).toBeNull();
    expect(foilPatternsOfSerie("sv")).toBeNull();
    expect(foilPatternsOfSerie(null)).toBeNull();
  });
});

/* Against the committed file, on cards checked by hand at TCGplayer on 2026-09-14. */
describe("patternPrintsFor", () => {
  it("offers 151's Machamp its collection box cosmos holo beside the plain card", () => {
    expect(patternPrintsFor("sv03.5-068")).toEqual({
      standard: true,
      prints: [{ foilPattern: "cosmos", finish: "holo", productId: 662070, printing: "holofoil" }],
    });
  });

  it("has no pattern for a card TCGplayer sells no pattern print of, which is an answer", () => {
    expect(patternPrintsFor("sv03-125")).toEqual({ standard: true, prints: [] });
  });

  it("says a promo that only ever was a cosmos holo has no Standard print", () => {
    expect(patternPrintsFor("svp-025")).toMatchObject({ standard: false });
  });

  it("tells a cosmos holo from a cosmos reverse holo of the same card", () => {
    expect(patternPrintsFor("swsh1-65")?.prints.map((p) => `${p.finish} ${p.foilPattern}`)).toEqual(
      ["holo cosmos", "reverse-holo cosmos"],
    );
  });

  it("is no answer for a card with no TCGplayer product", () => {
    expect(patternPrintsFor("no-such-card")).toBeNull();
  });
});

describe("finishPrintsFor", () => {
  it("names TCGplayer's patterned reverse products for a card, and none where it sells none", () => {
    expect(finishPrintsFor("sv08.5-074")).toEqual([
      { finish: "poke-ball", productId: 610590, printing: "holofoil" },
      { finish: "master-ball", productId: 610691, printing: "holofoil" },
    ]);
    expect(finishPrintsFor("sve-001")).toEqual([]);
    expect(finishPrintsFor("no-such-card")).toBeNull();
  });
});

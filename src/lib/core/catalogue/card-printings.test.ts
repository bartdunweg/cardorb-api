import { describe, expect, it } from "vitest";
import {
  editionsOf,
  finishPrintsFor,
  foilPatternsOfSerie,
  patternPrintsFor,
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
    // Ascended Heroes Pikachu: a Friend Ball reverse (no finish of its own here) and an Energy Symbol one.
    expect(
      printingsOf(
        [
          { type: "normal" },
          { type: "reverse", foil: "friendball" },
          { type: "reverse", foil: "energy" },
        ],
        "me02.5-055",
      ).map((p) => p.finish),
    ).toEqual(["normal", "reverse-holo", "energy-symbol"]);
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

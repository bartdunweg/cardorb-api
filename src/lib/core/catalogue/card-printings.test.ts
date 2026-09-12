import { describe, expect, it } from "vitest";
import { editionsOf, printingsOf } from "./card-printings";

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

  it("offers a Jungle card its two runs, because no Shadowless Jungle was printed", () => {
    expect(editionsOf("base2-1", true)).toEqual(["1st-edition", "unlimited"]);
  });

  it("offers a card printed once the one run it had", () => {
    expect(editionsOf("sv01-001", false)).toEqual(["unlimited"]);
  });
});

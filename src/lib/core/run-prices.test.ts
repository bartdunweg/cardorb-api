import { describe, expect, it } from "vitest";
import { invertedRunPrintings, unlimitedTwinOf } from "./run-prices.mjs";

describe("a 1st Edition's Unlimited twin", () => {
  it("is the same finish in the Unlimited run, by TCGplayer's names", () => {
    expect(unlimitedTwinOf("1st-edition-holofoil")).toBe("unlimited-holofoil");
    expect(unlimitedTwinOf("1st-edition")).toBe("unlimited");
  });

  it("is nothing for a printing that is no 1st Edition, Shadowless included", () => {
    for (const printing of ["unlimited-holofoil", "shadowless-holofoil", "holofoil", "normal"])
      expect(unlimitedTwinOf(printing)).toBeNull();
  });
});

describe("a 1st Edition below its Unlimited", () => {
  it("names Dark Charizard's 1st Edition holo at a third of its Unlimited (2026-09-21)", () => {
    expect(
      invertedRunPrintings({ "1st-edition-holofoil": 10694, "unlimited-holofoil": 33473 }),
    ).toEqual(["1st-edition-holofoil"]);
  });

  it("judges each finish against its own twin, never across finishes", () => {
    expect(
      invertedRunPrintings({
        "1st-edition": 200,
        unlimited: 150,
        "1st-edition-holofoil": 900,
        "unlimited-holofoil": 400,
      }),
    ).toEqual([]);
    expect(invertedRunPrintings({ "1st-edition": 200, "unlimited-holofoil": 400 })).toEqual([]);
  });

  it("leaves a 1st Edition equal to its Unlimited, or with no Unlimited figure, alone", () => {
    expect(invertedRunPrintings({ "1st-edition": 300, unlimited: 300 })).toEqual([]);
    expect(invertedRunPrintings({ "1st-edition": 300, unlimited: null })).toEqual([]);
    expect(invertedRunPrintings({ "1st-edition-holofoil": 300 })).toEqual([]);
    expect(invertedRunPrintings(undefined)).toEqual([]);
  });
});

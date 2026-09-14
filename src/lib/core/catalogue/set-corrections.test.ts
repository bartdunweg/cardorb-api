import { describe, expect, it } from "vitest";
import { correctedSet } from "./set-corrections";

describe("correctedSet", () => {
  it("lays a correction read by hand over TCGdex's answer, in the set's own catalogue", () => {
    expect(
      correctedSet({ id: "XY3", name: "Rising Fist", language: "ja", release_date: "2014/09/13" }),
    ).toMatchObject({
      release_date: "2014/06/14",
    });
    expect(
      correctedSet({
        id: "SV4a",
        name: "Shiny Treasure ex",
        language: "ja",
        local_name: "レイジングサーフ",
      }),
    ).toMatchObject({ local_name: "シャイニートレジャーex" });
  });

  it("leaves a set it has no correction for, and another catalogue's set of the same id, alone", () => {
    const set = {
      id: "sv01",
      name: "Scarlet & Violet",
      language: "en",
      release_date: "2023/03/31",
    };
    expect(correctedSet(set)).toBe(set);
    const english = { id: "XY3", name: "Furious Fists", release_date: "2014/05/07" };
    expect(correctedSet(english)).toBe(english);
  });
});

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

  it("names the EX sets and the trainer kits as their packs do, and a set's printed total as its cards", () => {
    expect(correctedSet({ id: "ex8", name: "Deoxys", language: "en" }).name).toBe("EX Deoxys");
    expect(
      correctedSet({ id: "tk-sm-l", name: "SM trainer Kit (Lycanroc)", language: "en" }).name,
    ).toBe("SM Trainer Kit (Lycanroc)");
    expect(
      correctedSet({ id: "SV11B", name: "Black Bolt", language: "ja", printed_total: 174 }),
    ).toMatchObject({
      printed_total: 86,
    });
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

describe("the set facts TCGplayer and Scrydex agree on against TCGdex (2026-09-17)", () => {
  it("dates Team Up and EX Team Magma vs Team Aqua as they were released, and names the Energy sets", () => {
    expect(correctedSet({ id: "sm9", name: "Team Up", release_date: "2019/01/31" })).toMatchObject({
      release_date: "2019/02/01",
    });
    expect(
      correctedSet({ id: "ex4", name: "Team Magma vs Team Aqua", release_date: "2004/03/01" }),
    ).toMatchObject({ name: "EX Team Magma vs Team Aqua", release_date: "2004/03/15" });
    expect(
      correctedSet({ id: "mee", name: "Mega Evolution Energy", release_date: "2025/09/25" }),
    ).toMatchObject({ name: "Mega Evolution Energies", release_date: "2025/09/26" });
    expect(correctedSet({ id: "sve", name: "Scarlet & Violet Energy" }).name).toBe(
      "Scarlet & Violet Energies",
    );
  });
});

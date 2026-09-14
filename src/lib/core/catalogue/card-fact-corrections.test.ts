import { describe, expect, it } from "vitest";
import { CARD_FACT_CORRECTIONS, correctedFacts, correctedName } from "./card-fact-corrections";

describe("correctedFacts", () => {
  it("gives a Best of Game card its type and rarity where TCGdex has none", () => {
    expect(correctedFacts("bog-2", { rarity: "None", types: [] })).toEqual({
      rarity: "Promo",
      types: ["Fighting"],
    });
  });

  it("replaces a type TCGdex has wrong, whatever order it lists types in", () => {
    expect(correctedFacts("2022swsh-14", { rarity: "None", types: ["Colorless"] }).types).toEqual([
      "Dragon",
    ]);
  });

  /* Dark Houndoom's correction was written for ["Darkness"] and TCGdex sends the type twice, so
     it never applied (2026-09-14). */
  it("matches a type list as TCGdex sends it, twice over included", () => {
    expect(
      correctedFacts("ex7-5", { rarity: "Rare", types: ["Darkness", "Darkness"] }).types,
    ).toEqual(["Fire", "Darkness"]);
    expect(
      correctedFacts("ex7-32", { rarity: "Uncommon", types: ["Darkness", "Darkness"] }).types,
    ).toEqual(["Darkness"]);
  });

  it("takes the energy type off a trainer and the trainer type off a Pokémon", () => {
    expect(
      correctedFacts("swshp-SWSH146", {
        rarity: "Promo",
        types: ["Lightning"],
        trainerType: "Item",
      }),
    ).toEqual({ rarity: "Promo", types: [], trainerType: "Item" });
    expect(
      correctedFacts("ecard1-118", { rarity: "Common", types: ["Water"], trainerType: "Stadium" })
        .trainerType,
    ).toBeNull();
  });

  const sheet = {
    illustrator: "Shinji Higuchi",
    hp: 140,
    stage: "Basic" as string | null,
    evolveFrom: null as string | null,
    regulationMark: null,
  };

  it("corrects the sheet's stage, HP, evolution and illustrator, and nothing else on it", () => {
    expect(correctedFacts("hgss1-111", { rarity: "LEGEND", types: ["Fire"], sheet }).sheet).toEqual(
      { ...sheet, stage: "LEGEND" },
    );
    expect(
      correctedFacts("ex11-113", { rarity: "Rare", types: ["Metal"], sheet: { ...sheet, hp: 70 } })
        .sheet?.hp,
    ).toBe(90);
    expect(
      correctedFacts("sv02-064", {
        rarity: "Uncommon",
        types: ["Lightning"],
        sheet: { ...sheet, stage: "Stage1", evolveFrom: "Pikachu ex" },
      }).sheet?.evolveFrom,
    ).toBe("Pikachu");
    expect(
      correctedFacts("fut2020-1", {
        rarity: "None",
        types: [],
        sheet: { ...sheet, illustrator: "Illus. & Direc. The Pokémon Company Art Team" },
      }).sheet?.illustrator,
    ).toBe("The Pokémon Company Art Team");
  });

  it("gives a stage to a card TCGdex has none for, and leaves one TCGdex has since given", () => {
    expect(
      correctedFacts("sm9-97", {
        rarity: "Ultra Rare",
        types: [],
        sheet: { ...sheet, stage: null },
      }).sheet?.stage,
    ).toBe("Stage2");
    expect(
      correctedFacts("hgss1-111", {
        rarity: "LEGEND",
        types: [],
        sheet: { ...sheet, stage: "Stage1" },
      }).sheet?.stage,
    ).toBe("Stage1");
  });

  it("does nothing once TCGdex says something else, so a fix upstream wins", () => {
    expect(correctedFacts("bog-2", { rarity: "Rare", types: ["Fighting"] })).toEqual({
      rarity: "Rare",
      types: ["Fighting"],
    });
    expect(correctedFacts("base1-4", { rarity: "Holo Rare", types: ["Fire"] })).toEqual({
      rarity: "Holo Rare",
      types: ["Fire"],
    });
  });

  it("never corrects to nothing, and keeps to the words TCGdex uses", () => {
    /* The three trainers TCGdex gave an energy type (2026-09-14) are the only cards corrected to
       no type at all. */
    const typeless = new Set(["swshp-SWSH146", "ecard1-142", "ecard1-143"]);
    for (const [id, fix] of Object.entries(CARD_FACT_CORRECTIONS)) {
      if (fix.stage)
        expect(["Basic", "Stage1", "Stage2", "Baby", "LEVEL-UP", "LEGEND"]).toContain(fix.stage[1]);
      if (fix.name) expect(fix.name[1].trim()).not.toBe("");
      if (fix.rarity)
        expect([
          "Common",
          "Uncommon",
          "Rare",
          "Promo",
          "Holo Rare",
          "Ultra Rare",
          "Secret Rare",
        ]).toContain(fix.rarity[1]);
      if (fix.types) expect(fix.types[1].length > 0 || typeless.has(id)).toBe(true);
    }
  });
});

describe("correctedName", () => {
  it("gives an LV.X card its LV.X and an English card its English name", () => {
    expect(correctedName("dp1-122", "Torterra")).toBe("Torterra LV.X");
    expect(correctedName("xy12-109", "ナッシー[Exeggutor]")).toBe("Exeggutor");
    expect(correctedName("dp1-122", "Torterra LV.X")).toBe("Torterra LV.X");
  });

  it("writes every apostrophe straight", () => {
    expect(correctedName("bog-8", "Rocket’s Mewtwo")).toBe("Rocket's Mewtwo");
    expect(correctedName("sm10-184", "Red's Challenge")).toBe("Red's Challenge");
  });
});

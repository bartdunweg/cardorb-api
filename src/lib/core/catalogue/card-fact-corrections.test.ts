import { describe, expect, it } from "vitest";
import {
  CARD_FACT_CORRECTIONS,
  ROUND_TWO_CORRECTIONS,
  correctedFacts,
  correctedName,
  ruledEvolveFrom,
  ruledRarity,
} from "./card-fact-corrections";
import RARITY_WORDS from "./rarity-words.json";

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

  it("reads the trainer type and evolution of the second table beside the first", () => {
    // ecard1-143 Master Ball has a types entry in the first table and a trainer type in the second.
    expect(
      correctedFacts("ecard1-143", { rarity: "Rare", types: ["Metal"], trainerType: null }),
    ).toEqual({ rarity: "Rare", types: [], trainerType: "Item" });
    expect(
      correctedFacts("ecard1-139", { rarity: "Uncommon", types: [], trainerType: "Stadium" })
        .trainerType,
    ).toBe("Item");
    expect(
      correctedFacts("ex10-80", { rarity: "Uncommon", types: [], trainerType: "Item" }).trainerType,
    ).toBe("Tool");
    expect(
      correctedFacts("ex4-8", {
        rarity: "Rare",
        types: ["Fighting"],
        sheet: { ...sheet, stage: "Stage1" },
      }).sheet?.evolveFrom,
    ).toBe("Team Magma's Baltoy");
  });

  it("gives an LV.X card the Pokémon it levels up as its evolution", () => {
    expect(
      correctedFacts(
        "dp5-121",
        { rarity: "Holo Rare LV.X", types: ["Fire"], sheet: { ...sheet, stage: "LEVEL-UP" } },
        "Infernape LV.X",
      ).sheet?.evolveFrom,
    ).toBe("Infernape");
    // Torterra LV.X is named "Torterra" at TCGdex: the name's correction comes first.
    expect(
      correctedFacts(
        "dp1-122",
        { rarity: "Rare", types: [], sheet: { ...sheet, stage: "LEVEL-UP" } },
        "Torterra",
      ).sheet?.evolveFrom,
    ).toBe("Torterra");
    expect(ruledEvolveFrom("Garchomp C LV.X", "LEVEL-UP", null)).toBe("Garchomp C");
    expect(ruledEvolveFrom("Garchomp C LV.X", "LEVEL-UP", "Gabite")).toBe("Gabite");
    expect(ruledEvolveFrom("Charizard", "Stage2", null)).toBeNull();
  });

  it("keeps no None, names Galarian Gallery and grades a Trainer Gallery's sub-tiers Ultra Rare", () => {
    expect(ruledRarity("mfb-1", "None")).toBeNull();
    expect(ruledRarity("swsh12.5gg-GG01", "Ultra Rare")).toBe("Galarian Gallery");
    expect(ruledRarity("swsh12.5gg-GG70", "Secret Rare")).toBe("Galarian Gallery");
    expect(ruledRarity("swsh12tg-TG12", "Holo Rare V")).toBe("Ultra Rare");
    expect(ruledRarity("swsh12tg-TG23", "Full Art Trainer")).toBe("Ultra Rare");
    expect(ruledRarity("swsh12tg-TG30", "Secret Rare")).toBe("Secret Rare");
    expect(ruledRarity("swsh12-176", "Holo Rare V")).toBe("Holo Rare V");
    expect(correctedFacts("swsh12.5gg-GG01", { rarity: "Rare", types: [] }).rarity).toBe(
      "Galarian Gallery",
    );
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
    for (const fix of Object.values(ROUND_TWO_CORRECTIONS)) {
      if (fix.trainerType)
        expect([
          "Item",
          "Supporter",
          "Stadium",
          "Tool",
          "Technical Machine",
          "Rocket's Secret Machine",
        ]).toContain(fix.trainerType[1]);
      if (fix.evolveFrom) expect(fix.evolveFrom[1].trim()).not.toBe("");
      expect(Object.keys(fix).every((k) => k === "trainerType" || k === "evolveFrom")).toBe(true);
    }
  });

  it("corrects only to a rarity in the one list", () => {
    for (const fix of [
      ...Object.values(CARD_FACT_CORRECTIONS),
      ...Object.values(ROUND_TWO_CORRECTIONS),
    ])
      if (fix.rarity) expect(RARITY_WORDS.en).toContain(fix.rarity[1]);
    expect(RARITY_WORDS.en).toContain(ruledRarity("swsh12.5gg-GG01", "Rare"));
  });
});

describe("correctedName", () => {
  it("gives an LV.X card its LV.X and an English card its English name", () => {
    expect(correctedName("dp1-122", "Torterra")).toBe("Torterra LV.X");
    expect(correctedName("xy12-109", "ナッシー[Exeggutor]")).toBe("Exeggutor");
    expect(correctedName("dp1-122", "Torterra LV.X")).toBe("Torterra LV.X");
  });

  it("writes an Unown's letter one way, the Unseen Forces ones from their number", () => {
    expect(correctedName("neo4-27", "Unown [G]")).toBe("Unown G");
    expect(correctedName("dp4-57", "Unown G")).toBe("Unown G");
    expect(correctedName("exu-G", "Unown")).toBe("Unown G");
    expect(correctedName("exu-%3F", "Unown")).toBe("Unown ?");
    expect(correctedName("exu-!", "Unown")).toBe("Unown !");
    expect(correctedName("sm8-90", "Unown")).toBe("Unown");
    expect(correctedName("swsh12-065", "Unown V")).toBe("Unown V");
  });

  it("writes a gold star card with its star, and leaves the words Star and Team Star alone", () => {
    expect(correctedName("ex13-103", "Mewtwo Star")).toBe("Mewtwo ☆");
    expect(correctedName("pop5-16", "Espeon ★")).toBe("Espeon ☆");
    expect(correctedName("ex13-102", "Gyarados Star δ")).toBe("Gyarados ☆ δ");
    expect(correctedName("ex10-114", "Raikou ☆")).toBe("Raikou ☆");
    expect(correctedName("sv01-195", "Team Star Grunt")).toBe("Team Star Grunt");
    expect(correctedName("ecard3-139", "Star Piece")).toBe("Star Piece");
  });

  it("writes EX and GX with a hyphen, Ho-Oh, Nidoran and the Elite Four as the card does", () => {
    expect(correctedName("xy6-77", "Shaymin EX")).toBe("Shaymin-EX");
    expect(correctedName("xy8-160", "M Mewtwo EX")).toBe("M Mewtwo-EX");
    expect(correctedName("sm10-82", "Marshadow & Machamp GX")).toBe("Marshadow & Machamp-GX");
    expect(correctedName("bw4-54", "Mewtwo-EX")).toBe("Mewtwo-EX");
    expect(correctedName("sv03.5-006", "Charizard ex")).toBe("Charizard ex");
    expect(correctedName("neo3-7", "Ho-oh")).toBe("Ho-Oh");
    expect(correctedName("lc-82", "Nidoran ♀")).toBe("Nidoran♀");
    expect(correctedName("pl2-17", "Drapion E4")).toBe("Drapion 4");
  });

  it("writes every apostrophe straight", () => {
    expect(correctedName("bog-8", "Rocket’s Mewtwo")).toBe("Rocket's Mewtwo");
    expect(correctedName("sm10-184", "Red's Challenge")).toBe("Red's Challenge");
  });
});

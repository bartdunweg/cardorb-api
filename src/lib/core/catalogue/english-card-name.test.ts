import { describe, expect, it } from "vitest";
import {
  englishFromLocalName,
  englishFromProduct,
  englishFromRecord,
  printedSuffix,
} from "./english-card-name.mjs";

// Every shape Cardmarket's product list had for the four catalogues on 2026-09-11, one each.
describe("englishFromProduct", () => {
  it("takes the name before the attacks", () => {
    expect(englishFromProduct("Oddish [Razor Leaf]")).toBe("Oddish");
    expect(englishFromProduct("Tatsugiri [Mise en Place | Curl Up]")).toBe("Tatsugiri");
    expect(englishFromProduct("Celebi ◇ [Time Distortion | Leech Seed | Prism]")).toBe("Celebi ◇");
    expect(englishFromProduct("Wo-Chien ex [Covetous Ivy | Forest Blast]")).toBe("Wo-Chien ex");
    // A set code in the bracket is a disambiguator too.
    expect(englishFromProduct("Misdreavus [Confuse Ray | s10a]")).toBe("Misdreavus");
  });

  it("leaves a trainer or an energy as it is", () => {
    expect(englishFromProduct("Escape Board")).toBe("Escape Board");
    expect(englishFromProduct("Professor Turo's Scenario")).toBe("Professor Turo's Scenario");
  });

  it("writes an energy type out where Cardmarket writes a letter", () => {
    expect(englishFromProduct("Heat [R] Energy")).toBe("Heat Fire Energy");
    expect(englishFromProduct("Aromatic [G] Energy")).toBe("Aromatic Grass Energy");
    expect(englishFromProduct("Speed [L] Energy")).toBe("Speed Lightning Energy");
  });

  it("reads Nidoran's letter as the gender sign, and drops the attacks after it", () => {
    expect(englishFromProduct("Nidoran [F] [Find a Friend | Gnaw]")).toBe("Nidoran♀");
    expect(englishFromProduct("Nidoran [M] [Horn Attack]")).toBe("Nidoran♂");
    expect(englishFromProduct("Team Rocket's Nidoran [F] [Surprise Attack]")).toBe(
      "Team Rocket's Nidoran♀",
    );
  });

  it("is null for nothing", () => {
    expect(englishFromProduct("")).toBeNull();
    expect(englishFromProduct(null)).toBeNull();
  });
});

describe("printedSuffix", () => {
  it("is the Latin tail of a name in another script", () => {
    expect(printedSuffix("マスカーニャex")).toBe("ex");
    expect(printedSuffix("セレビィ&フシギバナGX")).toBe("GX");
    expect(printedSuffix("ピカチュウVMAX")).toBe("VMAX");
    expect(printedSuffix("ナゾノクサ")).toBe("");
  });
});

describe("englishFromRecord", () => {
  const species = ["Bulbasaur", "Ivysaur", "Venusaur"];
  species[250] = "Celebi";
  species[42] = "Oddish";

  it("names a Pokémon by its Dex number, with the suffix as printed", () => {
    expect(englishFromRecord({ name: "ナゾノクサ", dexId: [43] }, species)).toBe("Oddish");
    expect(englishFromRecord({ name: "フシギバナex", dexId: [3] }, species)).toBe("Venusaur ex");
  });

  it("joins a tag team with an ampersand", () => {
    expect(englishFromRecord({ name: "セレビィ&フシギバナGX", dexId: [251, 3] }, species)).toBe(
      "Celebi & Venusaur GX",
    );
  });

  it("is null for a trainer, an energy, or a species the table does not have", () => {
    expect(englishFromRecord({ name: "ルミナスエネルギー", dexId: null }, species)).toBeNull();
    expect(englishFromRecord({ name: "?", dexId: [9999] }, species)).toBeNull();
    expect(englishFromRecord(null, species)).toBeNull();
  });
});

describe("englishFromLocalName", () => {
  const species = ["Bulbasaur", "Ivysaur", "Venusaur"];
  species[150] = "Mewtwo";
  species[151] = "Mew";
  species[759] = "Stufful";
  const local: Record<string, string>[] = [];
  local[0] = { ja: "フシギダネ", zhHant: "妙蛙種子", zhHans: "妙蛙种子", ko: "이상해씨" };
  local[2] = { ja: "フシギバナ", zhHant: "妙蛙花", zhHans: "妙蛙花", ko: "이상해꽃" };
  local[150] = { ja: "ミュウツー", zhHant: "超夢", zhHans: "超梦", ko: "뮤츠" };
  local[151] = { ja: "ミュウ", zhHant: "夢幻", zhHans: "梦幻", ko: "뮤" };
  local[759] = { ja: "ヌイコグマ", zhHant: "童偶熊", zhHans: "童偶熊", ko: "포곰곰" };

  it("names a Pokémon by the species written inside its printed name, suffix kept", () => {
    expect(englishFromLocalName("zh-tw", "童偶熊", local, species)).toBe("Stufful");
    expect(englishFromLocalName("zh-tw", "妙蛙花ex", local, species)).toBe("Venusaur ex");
    expect(englishFromLocalName("ja", "フシギバナVMAX", local, species)).toBe("Venusaur VMAX");
  });

  it("takes the longest species, so Mewtwo is not Mew", () => {
    expect(englishFromLocalName("ja", "ミュウツーex", local, species)).toBe("Mewtwo ex");
    expect(englishFromLocalName("ja", "ミュウex", local, species)).toBe("Mew ex");
  });

  it("splits a tag team at the ampersand", () => {
    expect(englishFromLocalName("zh-tw", "超夢&夢幻GX", local, species)).toBe("Mewtwo & Mew GX");
  });

  it("is null where no species is written in the name", () => {
    expect(englishFromLocalName("zh-tw", "博士的研究", local, species)).toBeNull();
    expect(englishFromLocalName("zh-tw", "", local, species)).toBeNull();
    expect(englishFromLocalName("de", "Bisasam", local, species)).toBeNull();
  });
});

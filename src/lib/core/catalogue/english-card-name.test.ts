import { describe, expect, it } from "vitest";
import { englishFromLocalName, englishFromRecord, printedSuffix } from "./english-card-name.mjs";

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
  local[0] = { ja: "フシギダネ" };
  local[2] = { ja: "フシギバナ" };
  local[150] = { ja: "ミュウツー" };
  local[151] = { ja: "ミュウ" };
  local[759] = { ja: "ヌイコグマ" };

  it("names a Pokémon by the species written inside its printed name, suffix kept", () => {
    expect(englishFromLocalName("ja", "ヌイコグマ", local, species)).toBe("Stufful");
    expect(englishFromLocalName("ja", "フシギバナex", local, species)).toBe("Venusaur ex");
    expect(englishFromLocalName("ja", "フシギバナVMAX", local, species)).toBe("Venusaur VMAX");
  });

  it("takes the longest species, so Mewtwo is not Mew", () => {
    expect(englishFromLocalName("ja", "ミュウツーex", local, species)).toBe("Mewtwo ex");
    expect(englishFromLocalName("ja", "ミュウex", local, species)).toBe("Mew ex");
  });

  it("splits a tag team at the ampersand", () => {
    expect(englishFromLocalName("ja", "ミュウツー&ミュウGX", local, species)).toBe(
      "Mewtwo & Mew GX",
    );
  });

  it("is null where no species is written in the name", () => {
    expect(englishFromLocalName("ja", "博士の研究", local, species)).toBeNull();
    expect(englishFromLocalName("ja", "", local, species)).toBeNull();
    expect(englishFromLocalName("de", "Bisasam", local, species)).toBeNull();
  });
});

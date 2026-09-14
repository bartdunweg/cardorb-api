import { describe, expect, it } from "vitest";
import {
  englishEvolveFrom,
  japaneseCardName,
  japaneseLocalName,
  japaneseStage,
  scrydexNameIsFuller,
} from "./japanese-card-facts";

describe("scrydexNameIsFuller", () => {
  it("takes Scrydex's name where it adds words, accents, or the copy's is still Japanese", () => {
    expect(scrydexNameIsFuller("Arcanine", "Light Arcanine")).toBe(true);
    expect(scrydexNameIsFuller("Mewtwo", "M Mewtwo-EX")).toBe(true);
    expect(scrydexNameIsFuller("Sandshrew", "Brock's Sandshrew")).toBe(true);
    expect(scrydexNameIsFuller("Flabebe", "Flabébé")).toBe(true);
    expect(scrydexNameIsFuller("粉末を癒します", "Heal Powder")).toBe(true);
  });

  it("keeps the copy's where Scrydex's is another name or no fuller", () => {
    expect(scrydexNameIsFuller("Fan Spinda", "Spinda")).toBe(false);
    expect(scrydexNameIsFuller("Charizard ex", "Charizard ex")).toBe(false);
    expect(scrydexNameIsFuller("Rocket's Celebi", "Dark Celebi")).toBe(false);
    expect(scrydexNameIsFuller("Pikachu", null)).toBe(false);
  });
});

describe("japaneseCardName", () => {
  it("writes the fuller name in the English game's printed style", () => {
    expect(japaneseCardName("XY8a", "Mewtwo", "M Mewtwo-EX")).toBe("M Mewtwo-EX");
    expect(japaneseCardName("XY8b", "M Houndoom Ex", "M Houndoom-EX")).toBe("M Houndoom-EX");
    expect(japaneseCardName("neo4", "Arcanine", "Light Arcanine")).toBe("Light Arcanine");
    expect(japaneseCardName("PCG2", "Latias Star", "Latias ☆")).toBe("Latias ☆");
  });
});

describe("japaneseLocalName", () => {
  it("fills a missing printed name, and replaces a vintage set's machine translation", () => {
    expect(japaneseLocalName("XY8b", null, "ヘルガーEX")).toBe("ヘルガーEX");
    expect(japaneseLocalName("SV4a", "リザードンex", "リザードンex")).toBe("リザードンex");
    expect(japaneseLocalName("neo4", "拡大鏡", "ピントレンズ")).toBe("ピントレンズ");
    expect(japaneseLocalName("SV4a", "リザードンex", null)).toBe("リザードンex");
  });
});

describe("englishEvolveFrom and japaneseStage", () => {
  it("writes an evolution TCGdex left in Japanese in English, and one stage spelling", () => {
    expect(englishEvolveFrom("リザード")).toBe("Charmeleon");
    expect(englishEvolveFrom("Charmeleon")).toBe("Charmeleon");
    expect(englishEvolveFrom(null)).toBeNull();
    expect(japaneseStage("Stage 1")).toBe("Stage1");
    expect(japaneseStage("Stage2")).toBe("Stage2");
    expect(japaneseStage("VMAX")).toBe("VMAX");
  });
});

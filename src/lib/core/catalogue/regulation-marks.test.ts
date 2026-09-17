import { describe, expect, it } from "vitest";
import MARKS from "./regulation-marks.generated.json";
import { withProductName, withRegulationMark } from "./mirror";
import type { CatalogueMatch } from "./ptcg-search";

const card = (id: string, name: string, regulationMark: string | null): CatalogueMatch =>
  ({
    id,
    number: id.split("-").pop() ?? "",
    name,
    localName: null,
    setName: "30th Celebration",
    series: "Mega Evolution",
    image: null,
    imageHigh: null,
    rarity: null,
    types: [],
    tcgId: id,
    sheet: {
      illustrator: null,
      hp: null,
      stage: null,
      evolveFrom: null,
      regulationMark,
      firstEdition: null,
      variants: [],
    },
  }) as CatalogueMatch;

describe("regulation-marks.generated.json", () => {
  it("gives 30th Celebration's cards the J they print, and a Classic Collection reprint its own or none", () => {
    const marks = MARKS as Record<string, string | null>;
    expect(marks["30th-001"]).toBe("J");
    expect(marks["30th-c-001"]).toBeNull();
    expect(marks["30th-c-028"]).toBe("D");
  });

  it("fills a mark TCGdex has none for, and never replaces one it has", () => {
    expect(withRegulationMark(card("30th-001", "Exeggcute", null)).sheet?.regulationMark).toBe("J");
    expect(withRegulationMark(card("30th-001", "Exeggcute", "H")).sheet?.regulationMark).toBe("H");
    expect(withRegulationMark(card("30th-c-001", "Charizard", null)).sheet?.regulationMark).toBe(
      null,
    );
  });
});

describe("withProductName", () => {
  it("names a card with the LV.X its product prints", () => {
    const facts = { name: "Palkia LV.X", stage: "LEVEL-UP", rarity: "Classic Collection" };
    expect(withProductName(card("30th-c-022", "Palkia", null), facts).name).toBe("Palkia LV.X");
    expect(withProductName(card("30th-c-022", "Palkia", null), undefined).name).toBe("Palkia");
  });
});

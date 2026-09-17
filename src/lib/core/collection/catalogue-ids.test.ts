import { describe, expect, it } from "vitest";
import { indexByNumber } from "../catalogue/set-index";
import { catalogueIdOf } from "./catalogue-ids";

/** 151 as the copy holds it (sv03.5), with a card named for the misspelling test. */
const catalogue151 = {
  byNumber: indexByNumber([
    [
      { id: "sv03.5-052", localId: "052", name: "Meowth" },
      { id: "sv03.5-032", localId: "032", name: "Nidoran♂" },
      { id: "sv03.5-013", localId: "013", name: "Weedle" },
    ],
  ]),
};
const row = (
  tcgId: string | null,
  number: string,
  name: string,
  language = null as null | "ja",
) => ({
  tcgId,
  number,
  name,
  language,
});

describe("catalogueIdOf", () => {
  it("puts a Dex or pokemontcg.io id on the card of the row's set and number", () => {
    expect(catalogueIdOf(row("sv35-52", "52", "Meowth"), catalogue151)).toBe("sv03.5-052");
    expect(catalogueIdOf(row("sv3pt5-13", "13", "Weedle"), catalogue151)).toBe("sv03.5-013");
    // The row's spelling of the name is not the copy's, and it is the same card.
    expect(catalogueIdOf(row("sv35-32", "32", "Nidoran ♂"), catalogue151)).toBe("sv03.5-032");
  });

  it("gives a row with no id the card it shows", () => {
    expect(catalogueIdOf(row(null, "052", "Meowth"), catalogue151)).toBe("sv03.5-052");
  });

  it("keeps an id the set already has, and one nothing resolves", () => {
    expect(catalogueIdOf(row("sv03.5-013", "13", "Weedle"), catalogue151)).toBe("sv03.5-013");
    expect(catalogueIdOf(row("sv35-999", "999", "Mew"), catalogue151)).toBe("sv35-999");
  });

  it("refuses a number that is another Pokémon's", () => {
    expect(catalogueIdOf(row("sv35-52", "52", "Pikachu"), catalogue151)).toBe("sv35-52");
  });

  it("leaves a Japanese row's id alone: it is the only way to find that card", () => {
    expect(catalogueIdOf(row("SV2a-052", "52", "Meowth", "ja"), catalogue151)).toBe("SV2a-052");
  });
});

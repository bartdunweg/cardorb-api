import { describe, expect, it } from "vitest";
import CLASSIC from "./classic-collection-numbers.generated.json";
import { classicNumberOf, printedNumberOf, setCodeOf } from "./set-codes";

describe("setCodeOf", () => {
  it("keeps the official abbreviation, and falls back to Pokémon TCG Online's code", () => {
    expect(setCodeOf("base1", "BS")).toBe("BS");
    expect(setCodeOf("basep", null)).toBe("PR");
    expect(setCodeOf("hgssp", null)).toBe("PR-HS");
    expect(setCodeOf("swshp", null)).toBeNull();
    expect(setCodeOf(null, null)).toBeNull();
  });
});

describe("printedNumberOf", () => {
  it("reads the number the card prints out of its catalogue id", () => {
    expect(printedNumberOf("xyp-XY124")).toBe("XY124");
    expect(printedNumberOf("svp-085")).toBe("085");
    expect(printedNumberOf("base1-4")).toBe("4");
    expect(printedNumberOf("swshp-SWSH282")).toBe("SWSH282");
    expect(printedNumberOf("exu-%3F")).toBe("?");
    expect(printedNumberOf(null)).toBeNull();
    expect(printedNumberOf("nodash")).toBeNull();
  });

  it("reads the number as the card prints it where TCGdex's id spells it another way", () => {
    expect(printedNumberOf("swsh1-1")).toBe("001");
    expect(printedNumberOf("swsh3.5-74")).toBe("074");
    expect(printedNumberOf("swsh1-202")).toBe("202");
    expect(printedNumberOf("cel25-5")).toBe("005");
    expect(printedNumberOf("ecard3-H01")).toBe("H1");
    expect(printedNumberOf("sm12-1")).toBe("1");
  });
});

describe("classicNumberOf", () => {
  it("reads a Classic Collection card's original number, the only one it prints", () => {
    expect(classicNumberOf("30th-c-001")).toBe("4/102");
    expect(classicNumberOf("cel25cc-CC001")).toBe("2/102");
    expect(printedNumberOf("30th-c-001")).toBe("4/102");
    expect(printedNumberOf("cel25cc-CC002")).toBe("4/102");
  });

  it("is null for every other card, which prints its own set's number", () => {
    expect(classicNumberOf("30th-001")).toBeNull();
    expect(classicNumberOf("cel25-5")).toBeNull();
    expect(classicNumberOf(null)).toBeNull();
    expect(printedNumberOf("30th-001")).toBe("001");
  });

  it("holds all 30 cards of 30th Classic Collection and all 25 of Celebrations', no number twice in a set", () => {
    const ids = Object.keys(CLASSIC);
    expect(ids.filter((id) => id.startsWith("30th-c-"))).toHaveLength(30);
    expect(ids.filter((id) => id.startsWith("cel25cc-"))).toHaveLength(25);
    for (const set of ["30th-c-", "cel25cc-"]) {
      const numbers = Object.entries(CLASSIC)
        .filter(([id]) => id.startsWith(set))
        .map(([, n]) => n);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
    for (const n of Object.values(CLASSIC)) expect(n).toMatch(/^\d+\/\d+$/);
  });
});

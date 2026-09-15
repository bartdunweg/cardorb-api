import { describe, expect, it } from "vitest";
import { printedNumberOf, setCodeOf } from "./set-codes";

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
});

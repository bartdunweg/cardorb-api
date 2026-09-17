import { describe, expect, it } from "vitest";
import { PRINT_RUN_NAMES, UNMAPPED_SUBTYPES, runsOfSubtypes } from "./print-runs.mjs";

describe("the print runs TCGdex names", () => {
  it("names the 1999-2000 copyright line as a run, decided (owner, 2026-09-17)", () => {
    expect(PRINT_RUN_NAMES["1999-2000-copyright"]).toBe("the 1999-2000 copyright line");
    expect(UNMAPPED_SUBTYPES.has("1999-2000-copyright")).toBe(false);
  });

  it("adds no word to the four editions the iOS app reads", () => {
    expect(runsOfSubtypes([{ subtype: "1999-2000-copyright" }])).toEqual([]);
    expect(runsOfSubtypes([{ subtype: "shadowless" }])).toEqual(["shadowless"]);
    expect(runsOfSubtypes([{ subtype: "shadowless-red-cheek" }])).toEqual(["shadowless"]);
    expect(runsOfSubtypes([{ subtype: "unlimited" }])).toEqual(["unlimited"]);
  });

  it("keeps a run decided out of the list of runs nobody has decided", () => {
    for (const kind of Object.keys(PRINT_RUN_NAMES))
      expect(UNMAPPED_SUBTYPES.has(kind)).toBe(false);
  });
});

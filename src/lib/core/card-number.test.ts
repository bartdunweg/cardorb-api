import { describe, expect, it } from "vitest";
import {
  PROMO_PREFIXES,
  THREE_DIGIT_SETS,
  canonNumber,
  correctedNumber,
  sameNumber,
} from "./card-number.mjs";
import { PROMO_PREFIXES as STORED_PREFIXES, compareCardNumbers } from "./util";

describe("sameNumber", () => {
  it("reads 001, 01 and 1 as one card", () => {
    expect(sameNumber("001", "1")).toBe(true);
    expect(sameNumber("01", "001")).toBe(true);
    expect(sameNumber(" 074 ", "74")).toBe(true);
    expect(sameNumber("100", "10")).toBe(false);
    expect(sameNumber("0", "00")).toBe(true);
  });

  it("keeps a gallery's letters, so TG01 is not card 1 but is TG1", () => {
    expect(sameNumber("TG01", "TG1")).toBe(true);
    expect(sameNumber("tg01", "TG01")).toBe(true);
    expect(sameNumber("TG01", "1")).toBe(false);
    expect(sameNumber("GG05", "5")).toBe(false);
    expect(sameNumber("SV049", "SV49")).toBe(true);
    expect(sameNumber("SV49", "49")).toBe(false);
  });

  it("keeps a letter after the number, so 60a is not 60", () => {
    expect(sameNumber("60a", "60A")).toBe(true);
    expect(sameNumber("060a", "60A")).toBe(true);
    expect(sameNumber("60a", "60")).toBe(false);
  });

  it("reads a promo as the number it wraps, as the collection stores it", () => {
    expect(sameNumber("SWSH020", "020")).toBe(true);
    expect(sameNumber("SWSH020", "20")).toBe(true);
    expect(sameNumber("SVP085", "85")).toBe(true);
    expect(sameNumber("XY67a", "67A")).toBe(true);
  });

  it("compares a number without digits as written, in any case", () => {
    expect(canonNumber("?")).toBe("?");
    expect(sameNumber("?", "!")).toBe(false);
    expect(sameNumber("ONE", "one")).toBe(true);
    expect(sameNumber(null, "")).toBe(true);
  });

  it("lists the promo prefixes the stored form strips", () => {
    expect(PROMO_PREFIXES).toEqual([...STORED_PREFIXES]);
  });
});

describe("correctedNumber", () => {
  it("pads the sets that print three digits, and only their one- and two-digit numbers", () => {
    expect(correctedNumber("swsh1-1", "1")).toBe("001");
    expect(correctedNumber("swsh8-99", "99")).toBe("099");
    expect(correctedNumber("swsh8-100", "100")).toBe("100");
    expect(correctedNumber("np-7", "7")).toBe("007");
    expect(correctedNumber("2024sv-15", "15")).toBe("015");
    expect(correctedNumber("swsh3.5-001", "001")).toBe("001");
  });

  it("leaves the sets that print no zeros alone", () => {
    expect(correctedNumber("sm12-1", "1")).toBe("1");
    expect(correctedNumber("2021swsh-1", "1")).toBe("1");
    expect(correctedNumber("swsh9-001", "001")).toBe("001");
    expect(correctedNumber("swsh4.5sv-SV001", "SV001")).toBe("SV001");
  });

  it("is written once: a corrected number corrects to itself", () => {
    for (const set of THREE_DIGIT_SETS) {
      const once = correctedNumber(`${set}-7`, "7");
      expect(correctedNumber(`${set}-7`, once)).toBe(once);
    }
  });

  it("keeps a padded number the same card and in the same place", () => {
    expect(sameNumber(correctedNumber("swsh1-9", "9"), "9")).toBe(true);
    const padded = ["010", "009", "100", "001"].sort(compareCardNumbers);
    expect(padded).toEqual(["001", "009", "010", "100"]);
  });
});

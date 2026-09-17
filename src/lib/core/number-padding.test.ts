import { describe, expect, it } from "vitest";
import READINGS from "./catalogue/number-padding.generated.json";
import { THREE_DIGIT_SETS } from "./card-number.mjs";
import {
  paddingReport,
  paddingWitness,
  printsPadded,
  scrydexPrintedNumber,
} from "./number-padding.mjs";

describe("scrydexPrintedNumber", () => {
  it("reads the printed number Scrydex's card page carries as data", () => {
    const page =
      "&quot;number&quot;:&quot;1&quot;,&quot;printed_number&quot;:&quot;001/202&quot;,&quot;additional_numbers&quot;:[]";
    expect(scrydexPrintedNumber(page)).toBe("001/202");
    expect(scrydexPrintedNumber("<html>no card</html>")).toBeNull();
  });
});

describe("printsPadded", () => {
  it("tells 001/202 from 1/102, and has no answer for a number with letters", () => {
    expect(printsPadded("001/202")).toBe(true);
    expect(printsPadded("001")).toBe(true);
    expect(printsPadded("1/102")).toBe(false);
    expect(printsPadded("10/102")).toBe(false);
    expect(printsPadded("TG01/TG30")).toBeNull();
    expect(printsPadded(null)).toBeNull();
  });
});

describe("paddingReport", () => {
  const witnesses = [
    { id: "swsh1-001", number: "001" },
    { id: "base1-1", number: "1" },
    { id: "newset-1", number: "1" },
    { id: "30th-c-001", number: "001", classic: true },
    { id: "unread-1", number: "1" },
  ];
  const readings = {
    swsh1: { card: "swsh1-1", scrydex: "001/202", tcgplayer: "001/202" },
    // TCGplayer pads Base Set; the card prints 1/102.
    base1: { card: "base1-1", scrydex: "1/102", tcgplayer: "001/102" },
    // A new set that prints 001 while the copy writes 1: the slip THREE_DIGIT_SETS is for.
    newset: { card: "newset-1", scrydex: "001/099", tcgplayer: null },
    unread: { card: "unread-1", scrydex: null, tcgplayer: null },
  };

  it("fails a set whose stored spelling is not Scrydex's, names the unread and the disputed", () => {
    expect(paddingReport(witnesses, readings)).toEqual({
      wrong: ["newset"],
      unread: ["unread"],
      disputed: ["base1"],
    });
  });

  it("picks the lowest plain number below ten as a set's witness", () => {
    expect(
      paddingWitness([
        { id: "a-TG01", number: "TG01" },
        { id: "a-003", number: "003" },
        { id: "a-001", number: "001" },
        { id: "a-010", number: "010" },
      ]),
    ).toEqual({ id: "a-001", number: "001" });
  });
});

describe("the committed readings", () => {
  it("say every set in THREE_DIGIT_SETS that Scrydex answers for prints 001", () => {
    const readings = READINGS as Record<string, { scrydex: string | null }>;
    for (const set of THREE_DIGIT_SETS) {
      const printed = printsPadded(readings[set]?.scrydex);
      if (printed != null) expect(printed, set).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { cardNumber } from "./util";

describe("cardNumber", () => {
  it("drops leading zeros and upper-cases a letter suffix", () => {
    expect(cardNumber("014")).toBe("14");
    expect(cardNumber("150A")).toBe("150A");
    expect(cardNumber("XY150a")).toBe("XY150A");
    expect(cardNumber("SWSH282")).toBe("SWSH282");
    expect(cardNumber("0")).toBe("0");
  });
});

describe("cardNumber with a prefix", () => {
  it("drops zeros after the letters as well", () => {
    expect(cardNumber("SV01")).toBe("SV1");
    expect(cardNumber("TG04")).toBe("TG4");
  });
});

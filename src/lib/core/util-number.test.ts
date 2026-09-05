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

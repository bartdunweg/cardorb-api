import { describe, expect, it } from "vitest";
import { FINISHES, isFinish, isReverseFinish } from "./collection-row";

describe("finish", () => {
  it("knows the five printings and nothing else", () => {
    for (const f of FINISHES) expect(isFinish(f)).toBe(true);
    expect(isFinish("pokeball")).toBe(false);
    expect(isFinish("foil")).toBe(false);
    expect(isFinish(null)).toBe(false);
  });

  it("prices the patterned reverses as a reverse holo, and a holo as plain", () => {
    expect(isReverseFinish("reverse-holo")).toBe(true);
    expect(isReverseFinish("poke-ball")).toBe(true);
    expect(isReverseFinish("master-ball")).toBe(true);
    expect(isReverseFinish("holo")).toBe(false);
    expect(isReverseFinish("normal")).toBe(false);
    expect(isReverseFinish(null)).toBe(false);
  });
});

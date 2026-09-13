import { describe, expect, it } from "vitest";
import { ptcgIdsFor } from "./set-logos";

describe("ptcgIdsFor", () => {
  it("tries pokemontcg.io's spelling of a TCGdex id first", () => {
    expect(ptcgIdsFor("sv05")[0]).toBe("sv5");
    expect(ptcgIdsFor("swsh12.5gg")[0]).toBe("swsh12pt5gg");
    expect(ptcgIdsFor("2022swsh")[0]).toBe("mcd22");
    expect(ptcgIdsFor("2023sv")).toContain("mcd23");
    expect(ptcgIdsFor("swsh9tg")).toContain("swsh9tg");
  });
});

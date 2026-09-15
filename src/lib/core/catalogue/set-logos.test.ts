import { describe, expect, it } from "vitest";
import type { CatalogueSet } from "./tcgdex-browse";
import { ptcgIdsFor, withSetLogos } from "./set-logos";

describe("ptcgIdsFor", () => {
  it("tries pokemontcg.io's spelling of a TCGdex id first", () => {
    expect(ptcgIdsFor("sv05")[0]).toBe("sv5");
    expect(ptcgIdsFor("swsh12.5gg")[0]).toBe("swsh12pt5gg");
    expect(ptcgIdsFor("2022swsh")[0]).toBe("mcd22");
    expect(ptcgIdsFor("2023sv")).toContain("mcd23");
    expect(ptcgIdsFor("swsh9tg")).toContain("swsh9tg");
  });
});

describe("withSetLogos", () => {
  it("gives the Unown Collection the wordmark of Unseen Forces, whose boosters it came in", async () => {
    const [exu] = await withSetLogos([
      { id: "exu", name: "Unseen Forces Unown Collection", logo: null } as CatalogueSet,
    ]);
    expect(exu?.logo).toBe("https://assets.tcgdex.net/en/ex/ex10/logo.webp");
  });
});

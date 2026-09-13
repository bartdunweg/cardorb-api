import { describe, expect, it } from "vitest";
import { galleriesByParent, isSubsetNumber, withoutFoldedGalleries } from "./set-galleries";
import type { CatalogueSet } from "./tcgdex-browse";

const set = (id: string, name: string): CatalogueSet =>
  ({
    id,
    name,
    series: "Sword & Shield",
    releaseDate: null,
    total: 0,
    printedTotal: null,
    logo: null,
    symbol: null,
    localName: null,
    cardsRecorded: true,
  }) as CatalogueSet;

describe("galleriesByParent", () => {
  it("finds each gallery's parent by name and leaves the gallery off the shelf", () => {
    const sets = [
      set("swsh9", "Brilliant Stars"),
      set("swsh9tg", "Brilliant Stars Trainer Gallery"),
      set("swsh12.5", "Crown Zenith"),
      set("swsh12.5gg", "Crown Zenith Galarian Gallery"),
      set("sv05", "Temporal Forces"),
    ];
    const galleries = galleriesByParent(sets);
    expect(galleries.get("swsh9")?.id).toBe("swsh9tg");
    expect(galleries.get("swsh12.5")?.id).toBe("swsh12.5gg");
    expect(withoutFoldedGalleries(sets, galleries).map((s) => s.id)).toEqual([
      "swsh9",
      "swsh12.5",
      "sv05",
    ]);
  });

  it("keeps a gallery whose parent is not on the shelf", () => {
    const sets = [set("x-tg", "Nowhere Trainer Gallery")];
    expect(withoutFoldedGalleries(sets, galleriesByParent(sets))).toHaveLength(1);
  });
});

describe("Shiny Vault and Classic Collection", () => {
  it("are shown inside their set, and their numbers are the subset's", () => {
    const sets = [
      set("sm11.5", "Hidden Fates"),
      set("sma", "Hidden Fates Shiny Vault"),
      set("swsh4.5", "Shining Fates"),
      set("swsh4.5sv", "Shining Fates Shiny Vault"),
      set("cel25", "Celebrations"),
      set("cel25cc", "Celebrations Classic Collection"),
    ];
    const galleries = galleriesByParent(sets);
    expect([...galleries].map(([p, g]) => `${p}:${g.id}`)).toEqual([
      "sm11.5:sma",
      "swsh4.5:swsh4.5sv",
      "cel25:cel25cc",
    ]);
    expect(["SV49", "SV001", "CC004", "TG05", "GG70"].every(isSubsetNumber)).toBe(true);
    expect(["49", "4", "SVP1"].some(isSubsetNumber)).toBe(false);
  });
});

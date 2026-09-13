import { describe, expect, it } from "vitest";
import { galleriesByParent, withoutFoldedGalleries } from "./set-galleries";
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

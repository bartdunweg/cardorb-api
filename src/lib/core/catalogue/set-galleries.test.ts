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

  /* A row on a catalogue card stores the number its card prints since 2026-09-20 (migration
     20260920160000), so a promo row now arrives here as "SM168" where it used to arrive as "168".
     ownership.ts asks this which shelf a row files under, and a promo that read as a subset would
     be marked on the gallery and not on its own set. None of the promo prefixes is a subset one:
     SVP fails /^SV\d/ because P is not a digit, and the rest share no opening with TG, GG, SV or
     CC. This is the guard on that, for the next prefix somebody adds to either list. */
  it("reads a promo's printed number as its set's, never a subset's", () => {
    const promos = [
      "SM168",
      "SWSH020",
      "XY123",
      "XY67a",
      "BW004",
      "DP12",
      "HGSS01",
      "SVP085",
      "SVP1",
    ];
    expect(promos.filter(isSubsetNumber)).toEqual([]);
    // And the subsets still read as subsets beside them, whatever their case.
    expect(["TG16", "gg01", "sv49", "cc004", "H1"].filter(isSubsetNumber)).toEqual([
      "TG16",
      "gg01",
      "sv49",
      "cc004",
    ]);
  });
});

describe("the Unown Collection", () => {
  it("is part of Unseen Forces, numbered by its letters", async () => {
    const { subsetParent, isSubsetNumber } = await import("./set-galleries");
    expect(subsetParent("Unseen Forces Unown Collection")).toBe("Unseen Forces");
    for (const n of ["A", "Z", "!", "?"]) expect(isSubsetNumber(n)).toBe(true);
    for (const n of ["1", "115", "AB"]) expect(isSubsetNumber(n)).toBe(false);
  });
});

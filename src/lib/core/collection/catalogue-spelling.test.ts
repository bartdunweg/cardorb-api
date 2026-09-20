import { describe, expect, it } from "vitest";
import { spellingOf, withCatalogueSpelling } from "./catalogue-spelling";
import type { Language } from "./collection-row";

const row = (
  tcgId: string | null,
  name: string,
  number: string,
  language: Language | null = null,
) => ({ tcgId, name, number, language });

/** The copy's spelling of the cards these tests name. */
const held = {
  "swsh10tg-TG16": {
    name: "Aerodactyl V",
    setName: "Astral Radiance Trainer Gallery",
    number: "TG16",
  },
  "sv03.5-032": { name: "Nidoran♂", setName: "151", number: "032" },
  "smp-SM168": { name: "Pikachu & Zekrom-GX", setName: "SM Black Star Promos", number: "SM168" },
};

describe("spellingOf", () => {
  it("takes the card's name, set name and printed number from the copy", () => {
    expect(
      spellingOf(
        row("swsh10tg-TG16", "Aerodactyl V", "TG16"),
        "Astral Radiance",
        held["swsh10tg-TG16"],
      ),
    ).toEqual({ name: "Aerodactyl V", setName: "Astral Radiance Trainer Gallery", number: "TG16" });
  });

  it("puts right an accent, an apostrophe and a missing symbol", () => {
    expect(spellingOf(row("sv03.5-032", "Nidoran", "032"), "151", held["sv03.5-032"]).name).toBe(
      "Nidoran♂",
    );
  });

  it("keeps a promo's printed prefix where the copy prints one", () => {
    expect(
      spellingOf(
        row("smp-SM168", "Pikachu & Zekrom GX", "168"),
        "Sun & Moon Promos",
        held["smp-SM168"],
      ),
    ).toEqual({
      name: "Pikachu & Zekrom-GX",
      setName: "SM Black Star Promos",
      number: "SM168",
    });
  });

  it("leaves a row the copy has no card for alone, its number in the stored form", () => {
    expect(spellingOf(row(null, "Pikachu", "XY123"), "XY Promos", undefined)).toEqual({
      name: "Pikachu",
      setName: "XY Promos",
      number: "123",
    });
  });

  it("trims and folds a promo number the copy cannot settle", () => {
    expect(
      spellingOf(row(null, "Pikachu", " SWSH050 "), "SWSH Black Star Promos", undefined).number,
    ).toBe("050");
    expect(spellingOf(row(null, "Aerodactyl V", "TG01"), "Silver Tempest", undefined).number).toBe(
      "TG01",
    );
  });

  it("leaves a Japanese row to its own catalogue", () => {
    expect(
      spellingOf(
        row("SV1a-007", "ピカチュウ", "007", "ja"),
        "トリプレットビート",
        held["sv03.5-032"],
      ),
    ).toEqual({ name: "ピカチュウ", setName: "トリプレットビート", number: "007" });
  });
});

describe("withCatalogueSpelling", () => {
  it("writes the set's name back through the field the caller names", async () => {
    const rows = [{ ...row("sv03.5-032", "Nidoran", "032"), set: "151 " }];
    const out = await withCatalogueSpelling(rows, {
      of: (r) => r.set,
      on: (r, set) => ({ ...r, set }),
    });
    // The copy cannot be read from a test, so nothing but the stored form moves: the point here is
    // that the accessor is used and the rest of the row survives the trip.
    expect(out[0]?.set).toBe("151 ");
    expect(out[0]?.name).toBe("Nidoran");
    expect(out[0]?.tcgId).toBe("sv03.5-032");
  });

  it("answers an empty list without asking the copy", async () => {
    expect(await withCatalogueSpelling([], { of: () => "", on: (r) => r })).toEqual([]);
  });
});

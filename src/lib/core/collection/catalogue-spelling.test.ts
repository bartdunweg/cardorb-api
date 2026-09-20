import { describe, expect, it } from "vitest";
import { spellingOf, withCatalogueSpelling, type CatalogueSpelling } from "./catalogue-spelling";
import type { Language } from "./collection-row";

const row = (
  tcgId: string | null,
  name: string,
  number: string,
  language: Language | null = null,
) => ({ tcgId, name, number, language });

/** The copy's spelling of the cards these tests name. */
const held = new Map<string, CatalogueSpelling>([
  [
    "swsh10tg-TG16",
    { name: "Aerodactyl V", setName: "Astral Radiance Trainer Gallery", number: "TG16" },
  ],
  ["sv03.5-032", { name: "Nidoran♂", setName: "151", number: "032" }],
  ["smp-SM168", { name: "Pikachu & Zekrom-GX", setName: "SM Black Star Promos", number: "SM168" }],
  ["xy6-77a", { name: "Shaymin-EX", setName: "Roaring Skies", number: "77a" }],
]);

describe("spellingOf", () => {
  it("takes the card's name, its set's name and its printed number from the copy", () => {
    expect(
      spellingOf(
        row("swsh10tg-TG16", "Aerodactyl V", "TG16"),
        "Astral Radiance",
        held.get("swsh10tg-TG16"),
      ),
    ).toEqual({
      name: "Aerodactyl V",
      setName: "Astral Radiance Trainer Gallery",
      number: "TG16",
    });
  });

  /* The three spellings the stored form used to impose, each now the card's own: the promo prefix
     it stripped, the case it folded, and the padding an import dropped. */
  it("gives a promo back its set's letters", () => {
    expect(
      spellingOf(
        row("smp-SM168", "Pikachu & Zekrom GX", "168"),
        "Sun & Moon Promos",
        held.get("smp-SM168"),
      ),
    ).toEqual({ name: "Pikachu & Zekrom-GX", setName: "SM Black Star Promos", number: "SM168" });
  });

  it("takes the card's own case and its own padding", () => {
    expect(
      spellingOf(row("xy6-77a", "Shaymin EX", "77A"), "Roaring Skies", held.get("xy6-77a")).number,
    ).toBe("77a");
    expect(
      spellingOf(row("sv03.5-032", "Nidoran", "32"), "151", held.get("sv03.5-032")).number,
    ).toBe("032");
  });

  it("puts right an accent, an apostrophe and a missing symbol", () => {
    expect(
      spellingOf(row("sv03.5-032", "Nidoran", "032"), "151", held.get("sv03.5-032")).name,
    ).toBe("Nidoran♂");
  });

  /* No card to copy, so the old stored form is the fallback: a number typed by hand for a set
     nobody catalogues still reads like its neighbours. */
  it("leaves a row the copy has no card for to the stored form", () => {
    expect(spellingOf(row(null, "Pikachu", " XY123 "), "XY Black Star Promos", undefined)).toEqual({
      name: "Pikachu",
      setName: "XY Black Star Promos",
      number: "123",
    });
    expect(spellingOf(row(null, "Aerodactyl V", "TG01"), "A set of my own", undefined).number).toBe(
      "TG01",
    );
  });

  it("leaves a Japanese row to its own catalogue", () => {
    expect(
      spellingOf(
        row("SV1a-007", "ピカチュウ", "007", "ja"),
        "トリプレットビート",
        held.get("sv03.5-032"),
      ),
    ).toEqual({ name: "ピカチュウ", setName: "トリプレットビート", number: "007" });
  });
});

describe("withCatalogueSpelling", () => {
  /** A draft names its set `set`, an imported row `setName`; both go through the same accessor. */
  const field = <T extends { set: string }>() => ({
    of: (r: T) => r.set,
    on: (r: T, set: string) => ({ ...r, set }),
  });

  it("renames the row and its set out of the copy, through the caller's field", async () => {
    const rows = [
      { ...row("swsh10tg-TG16", "Aerodactyl V", "TG16"), set: "Astral Radiance", quantity: 2 },
    ];
    const out = await withCatalogueSpelling(rows, field(), held);
    expect(out[0]).toEqual({
      tcgId: "swsh10tg-TG16",
      name: "Aerodactyl V",
      number: "TG16",
      language: null,
      set: "Astral Radiance Trainer Gallery",
      // Everything else of the row survives the trip.
      quantity: 2,
    });
  });

  it("spells each row of a batch by its own card, and leaves an unknown one", async () => {
    const rows = [
      { ...row("sv03.5-032", "Nidoran", "32"), set: "151" },
      { ...row("smp-SM168", "Pikachu & Zekrom GX", "168"), set: "Sun & Moon Promos" },
      { ...row("no-such-1", "Typed by hand", "SWSH050"), set: "A set of my own" },
    ];
    const out = await withCatalogueSpelling(rows, field(), held);
    expect(out.map((r) => [r.name, r.set, r.number])).toEqual([
      ["Nidoran♂", "151", "032"],
      ["Pikachu & Zekrom-GX", "SM Black Star Promos", "SM168"],
      ["Typed by hand", "A set of my own", "050"],
    ]);
  });

  it("answers an empty list without asking the copy", async () => {
    expect(await withCatalogueSpelling([], { of: () => "", on: (r) => r })).toEqual([]);
  });
});

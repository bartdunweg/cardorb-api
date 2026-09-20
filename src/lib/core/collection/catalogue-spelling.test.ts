import { describe, expect, it } from "vitest";
import { spellingOf, withCatalogueSpelling, type CatalogueSpelling } from "./catalogue-spelling";
import type { Language } from "./collection-row";

const row = (tcgId: string | null, name: string, language: Language | null = null) => ({
  tcgId,
  name,
  language,
});

/** The copy's spelling of the cards these tests name. */
const held = new Map<string, CatalogueSpelling>([
  ["swsh10tg-TG16", { name: "Aerodactyl V", setName: "Astral Radiance Trainer Gallery" }],
  ["sv03.5-032", { name: "Nidoran♂", setName: "151" }],
  ["smp-SM168", { name: "Pikachu & Zekrom-GX", setName: "SM Black Star Promos" }],
]);

describe("spellingOf", () => {
  it("takes the card's name and its set's name from the copy", () => {
    expect(
      spellingOf(
        row("swsh10tg-TG16", "Aerodactyl V"),
        "Astral Radiance",
        held.get("swsh10tg-TG16"),
      ),
    ).toEqual({ name: "Aerodactyl V", setName: "Astral Radiance Trainer Gallery" });
  });

  it("puts right an accent, an apostrophe and a missing symbol", () => {
    expect(spellingOf(row("sv03.5-032", "Nidoran"), "151", held.get("sv03.5-032")).name).toBe(
      "Nidoran♂",
    );
  });

  it("leaves a row the copy has no card for alone", () => {
    expect(spellingOf(row(null, "Pikachu"), "XY Black Star Promos", undefined)).toEqual({
      name: "Pikachu",
      setName: "XY Black Star Promos",
    });
  });

  it("leaves a Japanese row to its own catalogue", () => {
    expect(
      spellingOf(row("SV1a-007", "ピカチュウ", "ja"), "トリプレットビート", held.get("sv03.5-032")),
    ).toEqual({ name: "ピカチュウ", setName: "トリプレットビート" });
  });
});

describe("withCatalogueSpelling", () => {
  /** A draft names its set `set`, an imported row `setName`; both go through the same accessor. */
  const field = <T extends { set: string }>() => ({
    of: (r: T) => r.set,
    on: (r: T, set: string) => ({ ...r, set }),
  });

  it("renames the row and its set out of the copy, through the caller's field", async () => {
    const rows = [{ ...row("swsh10tg-TG16", "Aerodactyl V"), set: "Astral Radiance", quantity: 2 }];
    const out = await withCatalogueSpelling(rows, field(), held);
    expect(out[0]).toEqual({
      tcgId: "swsh10tg-TG16",
      name: "Aerodactyl V",
      language: null,
      set: "Astral Radiance Trainer Gallery",
      // Everything else of the row survives the trip.
      quantity: 2,
    });
  });

  it("spells each row of a batch by its own card, and leaves an unknown one", async () => {
    const rows = [
      { ...row("sv03.5-032", "Nidoran"), set: "151" },
      { ...row("smp-SM168", "Pikachu & Zekrom GX"), set: "Sun & Moon Promos" },
      { ...row("no-such-1", "Typed by hand"), set: "A set of my own" },
    ];
    const out = await withCatalogueSpelling(rows, field(), held);
    expect(out.map((r) => [r.name, r.set])).toEqual([
      ["Nidoran♂", "151"],
      ["Pikachu & Zekrom-GX", "SM Black Star Promos"],
      ["Typed by hand", "A set of my own"],
    ]);
  });

  it("answers an empty list without asking the copy", async () => {
    expect(await withCatalogueSpelling([], { of: () => "", on: (r) => r })).toEqual([]);
  });
});

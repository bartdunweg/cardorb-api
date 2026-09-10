import { describe, expect, it } from "vitest";
import { importKey, splitExisting } from "./import-match";
import type { CollectionRow } from "./collection-row";

const card = (over: Partial<CollectionRow>): CollectionRow => ({
  id: null,
  name: "Espeon",
  number: "48",
  setName: "Dark Explorers",
  rarity: null,
  gen: null,
  types: [],
  tcgId: null,
  owned: true,
  excluded: false,
  acquiredAt: null,
  finish: null,
  foilPattern: null,
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  collectionId: null,
  ...over,
});

describe("importKey", () => {
  it("ignores punctuation, case and leading zeros", () => {
    expect(importKey({ name: "Espeon", setName: "Dark Explorers", number: "048" })).toBe(
      importKey({ name: "espeon", setName: "dark  explorers", number: "48" }),
    );
  });

  it("sees one card through the printed number's denominator", () => {
    expect(importKey({ name: "Espeon", setName: "Dark Explorers", number: "48/108" })).toBe(
      importKey({ name: "Espeon", setName: "Dark Explorers", number: "48" }),
    );
  });

  it("files a card under its bare name, suffix or not", () => {
    expect(importKey({ name: "Venusaur ex", setName: "151", number: "4" })).toBe(
      importKey({ name: "Venusaur", setName: "151", number: "4" }),
    );
  });

  it("keeps two different cards apart", () => {
    expect(importKey({ name: "Mew", setName: "151", number: "151" })).not.toBe(
      importKey({ name: "Mewtwo", setName: "151", number: "150" }),
    );
  });
});

describe("splitExisting", () => {
  it("puts a card the collection holds on the existing side", () => {
    const held = new Set([importKey({ name: "Espeon", setName: "Dark Explorers", number: "48" })]);
    const { fresh, existing } = splitExisting(
      [card({}), card({ name: "Umbreon", number: "70" })],
      held,
    );

    expect(existing.map((r) => r.name)).toEqual(["Espeon"]);
    expect(fresh.map((r) => r.name)).toEqual(["Umbreon"]);
  });

  it("keeps both printings of one card from the same file", () => {
    const rows = [card({ finish: "normal" }), card({ finish: "reverse-holo" })];

    expect(splitExisting(rows, new Set()).fresh).toHaveLength(2);
  });

  it("calls everything new when the collection is empty", () => {
    expect(splitExisting([card({}), card({ name: "Umbreon" })], new Set()).existing).toEqual([]);
  });
});

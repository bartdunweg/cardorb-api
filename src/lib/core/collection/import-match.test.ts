import { describe, expect, it } from "vitest";
import { importKey, importKeys, splitExisting } from "./import-match";
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
  edition: null,
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  dexFace: false,
  collectionId: null,
  ...over,
});

describe("importKey", () => {
  it("ignores punctuation, case and leading zeros", () => {
    expect(importKey({ name: "Espeon", setName: "Dark Explorers", number: "048" })).toBe(
      importKey({ name: "espeon", setName: "dark  explorers", number: "48" }),
    );
  });

  it("sees one set through the name it was filed under, given the official one", () => {
    const titleOf = (s: string) => (s === "Set 1 Unlimited" ? "Base Set" : s);
    expect(importKey({ name: "Pikachu", setName: "Set 1 Unlimited", number: "58" }, titleOf)).toBe(
      importKey({ name: "Pikachu", setName: "Base Set", number: "58" }, titleOf),
    );
    expect(importKey({ name: "Pikachu", setName: "Set 1 Unlimited", number: "58" })).not.toBe(
      importKey({ name: "Pikachu", setName: "Base Set", number: "58" }),
    );
  });

  it("counts a card held under a filing name as existing when the file says the official one", () => {
    const titleOf = (s: string) => (s === "Set 1 Unlimited" ? "Base Set" : s);
    const held = new Set([
      importKey({ name: "Pikachu", setName: "Set 1 Unlimited", number: "58" }, titleOf),
    ]);
    const { existing } = splitExisting(
      [card({ name: "Pikachu", setName: "Base Set", number: "58" })],
      held,
      titleOf,
    );

    expect(existing).toHaveLength(1);
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

/**
 * The catalogue id, which is the exact answer where both sides have one.
 *
 * Dex writes it in its sixth column and the rows here have carried one since the catalogue
 * backfill, so on a real file this is how most of it is recognised: no set name, no spelling,
 * no denominator.
 */
describe("importKeys", () => {
  it("offers the id and the name, and only the name where there is no id", () => {
    expect(
      importKeys({ name: "Espeon", setName: "Dark Explorers", number: "48", tcgId: "bw5-48" }),
    ).toEqual([
      "id bw5-48",
      importKey({ name: "Espeon", setName: "Dark Explorers", number: "48" }),
    ]);
    expect(importKeys({ name: "Espeon", setName: "Dark Explorers", number: "48" })).toEqual([
      importKey({ name: "Espeon", setName: "Dark Explorers", number: "48" }),
    ]);
  });

  it("recognises a card through a set name neither side agrees on", () => {
    // The Notion rows call Base Set "Set 1 Unlimited"; the file calls it what the card says.
    // Nothing folds these names here, and the id is enough on its own.
    const held = new Set(
      importKeys({ name: "Pikachu", setName: "Set 1 Unlimited", number: "58", tcgId: "base1-58" }),
    );
    const { existing, fresh } = splitExisting(
      [
        card({ name: "Pikachu", setName: "Base Set", number: "58/102", tcgId: "base1-58" }),
        card({ name: "Pikachu", setName: "Base Set", number: "58", tcgId: "base2-58" }),
      ],
      held,
    );

    expect(existing.map((r) => r.tcgId)).toEqual(["base1-58"]);
    expect(fresh.map((r) => r.tcgId)).toEqual(["base2-58"]);
  });

  it("still meets on the name where one side has no id", () => {
    const held = new Set(importKeys({ name: "Espeon", setName: "Dark Explorers", number: "48" }));
    const { existing } = splitExisting([card({ tcgId: "bw5-48" })], held);

    expect(existing).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { latestPull } from "./cards";
import type { CardSet, OwnedCard, Variant } from "./cards";

const variant = (over: Partial<Variant> = {}): Variant => ({
  id: null,
  rarity: null,
  owned: true,
  finish: null,
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  acquiredAt: null,
  excluded: false,
  collectionId: null,
  ...over,
});

const card = (over: Partial<OwnedCard> = {}): OwnedCard => ({
  key: over.name ?? "c",
  name: "Pikachu",
  number: "001",
  type: null,
  gen: null,
  image: null,
  imageHigh: null,
  imageSize: null,
  speciesId: null,
  variants: [variant()],
  owned: true,
  price: null,
  priceHolo: null,
  tcgId: null,
  ...over,
});

const set = (name: string, cards: OwnedCard[]): CardSet => ({
  name,
  title: name,
  logo: null,
  logoSize: null,
  releaseDate: null,
  total: null,
  cards,
});

describe("latestPull", () => {
  it("returns null for an empty collection", () => {
    expect(latestPull([])).toBeNull();
  });

  it("returns null when every printing is excluded", () => {
    const s = set("A", [
      card({
        key: "1",
        variants: [variant({ acquiredAt: "2026-01-01T00:00:00.000Z", excluded: true })],
      }),
    ]);
    expect(latestPull([s])).toBeNull();
  });

  it("returns null when no printing has an acquiredAt", () => {
    const s = set("A", [card({ key: "1", variants: [variant({ acquiredAt: null })] })]);
    expect(latestPull([s])).toBeNull();
  });

  it("returns null when every printing is on the wishlist", () => {
    const s = set("A", [
      card({
        key: "1",
        variants: [variant({ acquiredAt: "2026-01-01T00:00:00.000Z", owned: false })],
      }),
    ]);
    expect(latestPull([s])).toBeNull();
  });

  it("skips a newer wishlist printing for an older owned one", () => {
    const owned = card({
      key: "owned",
      name: "Charizard",
      variants: [variant({ acquiredAt: "2026-01-01T00:00:00.000Z" })],
    });
    // A wanted card, added to the store more recently than the last real pull.
    const wanted = card({
      key: "wanted",
      name: "Umbreon",
      variants: [variant({ acquiredAt: "2026-07-25T00:00:00.000Z", owned: false })],
    });

    expect(latestPull([set("A", [owned, wanted])])).toMatchObject({ name: "Charizard" });
  });

  it("picks the owned printing of a card that is also on the wishlist", () => {
    // Same card, two rows: one in the binder, one wanted in another rarity.
    const both = card({
      key: "both",
      name: "Pikachu",
      variants: [
        variant({ acquiredAt: "2026-02-01T00:00:00.000Z", rarity: "Common" }),
        variant({
          acquiredAt: "2026-06-01T00:00:00.000Z",
          rarity: "Illustration Rare",
          owned: false,
        }),
      ],
    });

    expect(latestPull([set("A", [both])])).toMatchObject({
      rarity: "Common",
      acquiredAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("picks the newest acquiredAt across sets", () => {
    const older = card({
      key: "older",
      name: "Bulbasaur",
      variants: [variant({ acquiredAt: "2025-06-01T00:00:00.000Z", rarity: "Common" })],
    });
    const newer = card({
      key: "newer",
      name: "Charizard",
      number: "004",
      variants: [variant({ acquiredAt: "2026-08-10T12:00:00.000Z", rarity: "Rare Holo" })],
    });
    const excludedButNewest = card({
      key: "excluded",
      name: "Mewtwo",
      variants: [variant({ acquiredAt: "2026-08-15T00:00:00.000Z", excluded: true })],
    });

    const result = latestPull([set("Base", [older]), set("New", [newer, excludedButNewest])]);

    expect(result).toMatchObject({
      name: "Charizard",
      number: "004",
      rarity: "Rare Holo",
      setName: "New",
      acquiredAt: "2026-08-10T12:00:00.000Z",
    });
  });
});

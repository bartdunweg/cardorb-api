import { describe, expect, it } from "vitest";
import { canonNumber, markOwnership, ownershipIndex, ownershipOf, setCounts } from "./ownership";
import type { CollectionRow } from "./collection-row";
import type { CatalogueMatch } from "../catalogue/ptcg-search";
import type { CatalogueSet } from "../catalogue/ptcg-browse";

const row = (over: Partial<CollectionRow> = {}): CollectionRow => ({
  id: "row-1",
  name: "Charizard",
  number: "004",
  setName: "Base",
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

const card = (over: Partial<CatalogueMatch> = {}): CatalogueMatch => ({
  id: "base1-4",
  number: "4",
  name: "Charizard",
  setName: "Base",
  image: null,
  imageHigh: null,
  rarity: null,
  types: [],
  series: "Scarlet & Violet",
  ...over,
});

const set = (over: Partial<CatalogueSet> = {}): CatalogueSet => ({
  id: "base1",
  name: "Base",
  series: "Base",
  releaseDate: "1999/01/09",
  cardsRecorded: true,
  total: 102,
  printedTotal: 102,
  logo: null,
  symbol: null,
  localName: null,
  ...over,
});

const of = (rows: CollectionRow[], c: CatalogueMatch) => ownershipOf(ownershipIndex(rows), c);

describe("canonNumber", () => {
  it("drops the padding the collection writes and the catalogues do not", () => {
    expect(canonNumber("004")).toBe("4");
    expect(canonNumber("4")).toBe("4");
    expect(canonNumber(" 088 ")).toBe("88");
  });

  it("keeps a letter prefix, so TG01 is not card 1", () => {
    expect(canonNumber("TG01")).toBe("tg1");
    expect(canonNumber("tg1")).toBe("tg1");
    expect(canonNumber("SVP001")).toBe("svp1");
    expect(canonNumber("004")).not.toBe(canonNumber("TG04"));
  });

  it("keeps a letter suffix, which is a different printing", () => {
    expect(canonNumber("143a")).toBe("143a");
    expect(canonNumber("143a")).not.toBe(canonNumber("143"));
  });
});

describe("ownershipOf", () => {
  it("matches a padded row against an unpadded catalogue number", () => {
    expect(of([row()], card())).toMatchObject({ owned: true, quantity: 1, itemIds: ["row-1"] });
  });

  it("refuses a number that lines up on a card by another name", () => {
    expect(of([row({ name: "Blastoise" })], card())).toMatchObject({ owned: false, itemIds: [] });
  });

  it("still matches through the name spellings sameCard() forgives", () => {
    /* The collection files ex cards without the suffix, and misspells. Both are
       real rows from this collection; see matching.ts. */
    expect(of([row({ name: "Charizard ex" })], card()).owned).toBe(true);
    expect(of([row({ name: "Charizrad" })], card()).owned).toBe(true);
  });

  it("does not match across sets", () => {
    expect(of([row({ setName: "Jungle" })], card()).owned).toBe(false);
  });

  it("reads a wishlist row as wanted rather than held", () => {
    expect(of([row({ owned: false })], card())).toMatchObject({
      owned: false,
      wishlist: true,
      quantity: 0,
      itemIds: ["row-1"],
    });
  });

  it("sums quantity over owned rows only, and reports both states at once", () => {
    const rows = [
      row({ id: "a", quantity: 2 }),
      row({ id: "b", quantity: 3 }),
      row({ id: "c", owned: false, quantity: 9 }),
    ];
    expect(of(rows, card())).toMatchObject({
      owned: true,
      wishlist: true,
      quantity: 5,
      itemIds: ["a", "b", "c"],
    });
  });

  it("finds a gallery card filed under its parent set", () => {
    const rows = [row({ name: "Zeraora", number: "TG12", setName: "Silver Tempest" })];
    const tg = card({
      id: "swsh12tg-TG12",
      number: "TG12",
      name: "Zeraora",
      setName: "Silver Tempest Trainer Gallery",
    });
    expect(of(rows, tg).owned).toBe(true);
  });

  it("finds a promo filed under the abbreviation the collection uses", () => {
    const rows = [row({ name: "Pikachu", number: "044", setName: "SV Black Star Promos" })];
    const promo = card({
      id: "svp-44",
      number: "44",
      name: "Pikachu",
      setName: "Scarlet & Violet Black Star Promos",
    });
    expect(of(rows, promo).owned).toBe(true);
  });
});

describe("markOwnership", () => {
  it("keeps the catalogue fields and adds the four of its own", () => {
    const [marked] = markOwnership(ownershipIndex([row()]), [card({ rarity: "Rare Holo" })]);
    expect(marked).toMatchObject({
      id: "base1-4",
      name: "Charizard",
      rarity: "Rare Holo",
      owned: true,
      wishlist: false,
      quantity: 1,
    });
  });
});

describe("setCounts", () => {
  it("counts distinct cards, not copies: two Charizard are one card of the set", () => {
    const rows = [row({ id: "a", quantity: 2 }), row({ id: "b", number: "007", name: "Squirtle" })];
    expect(setCounts(ownershipIndex(rows), set())).toEqual({ ownedCount: 2, wishlistCount: 0 });
  });

  it("reads a padded and an unpadded number as the same card", () => {
    const rows = [row({ id: "a", number: "088" }), row({ id: "b", number: "88" })];
    expect(setCounts(ownershipIndex(rows), set())).toEqual({ ownedCount: 1, wishlistCount: 0 });
  });

  it("does not let a wishlist row for a card you also own count twice", () => {
    const rows = [row({ id: "a" }), row({ id: "w", owned: false })];
    expect(setCounts(ownershipIndex(rows), set())).toEqual({ ownedCount: 1, wishlistCount: 1 });
  });

  it("counts a wishlist row separately, never as owned", () => {
    const rows = [row({ owned: false, quantity: 4 })];
    expect(setCounts(ownershipIndex(rows), set())).toEqual({ ownedCount: 0, wishlistCount: 1 });
  });

  it("leaves gallery rows out of the parent set's count", () => {
    /* Both rows are filed under "Silver Tempest", which is how the collection
       writes them — the gallery one belongs to the gallery set's count, not to
       this one, or the two together would claim 2 of 215 and 1 of 30. */
    const rows = [
      row({ id: "a", setName: "Silver Tempest" }),
      row({ id: "tg", setName: "Silver Tempest", number: "TG12", name: "Zeraora" }),
    ];
    expect(setCounts(ownershipIndex(rows), set({ name: "Silver Tempest" }))).toEqual({
      ownedCount: 1,
      wishlistCount: 0,
    });
  });

  it("counts only the gallery rows for a gallery set", () => {
    const rows = [
      row({ id: "a", setName: "Silver Tempest" }),
      row({ id: "b", setName: "Silver Tempest", number: "TG12", name: "Zeraora" }),
    ];
    const counts = setCounts(ownershipIndex(rows), set({ name: "Silver Tempest Trainer Gallery" }));
    expect(counts).toEqual({ ownedCount: 1, wishlistCount: 0 });
  });

  it("is zero for a set nothing is filed under", () => {
    expect(setCounts(ownershipIndex([row()]), set({ name: "Jungle" }))).toEqual({
      ownedCount: 0,
      wishlistCount: 0,
    });
  });
});

/**
 * The shelf a language other than English browses, and the shelf it must not mark.
 *
 * STATE.md recorded this as open: the index matched by English set name, so a
 * Japanese set shown as "Black Bolt" counted the English Black Bolt cards, and
 * the routes worked around it by handing the index no rows at all — which is
 * why a Japanese set has never shown a single ownership mark. Both halves are
 * closed here, by the row's own catalogue id.
 */
describe("ownership across two catalogues", () => {
  const japanese = (over: Partial<CollectionRow> = {}) =>
    row({
      id: "ja-1",
      name: "マスカーニャex",
      number: "007",
      setName: "Triplet Beat",
      language: "ja",
      tcgId: "SV1a-007",
      ...over,
    });
  const jaCard = card({
    id: "SV1a-007",
    number: "007",
    name: "マスカーニャex",
    setName: "Triplet Beat",
  });

  it("marks a Japanese card by its id, with no name or number to get wrong", () => {
    const index = ownershipIndex([japanese()], "ja");
    expect(ownershipOf(index, jaCard)).toMatchObject({
      owned: true,
      quantity: 1,
      itemIds: ["ja-1"],
    });
  });

  it("does not let a Japanese row mark the English set of the same name", () => {
    // "Black Bolt" and "Triplet Beat" are both real English sets and the names
    // the shelf shows two Japanese sets under. A row filed under one of those
    // names is not a card of the other.
    const english = card({
      id: "me01-007",
      number: "007",
      name: "Meowscarada ex",
      setName: "Triplet Beat",
    });
    expect(ownershipOf(ownershipIndex([japanese()]), english)).toMatchObject({ owned: false });
    expect(
      setCounts(ownershipIndex([japanese()]), set({ id: "me01", name: "Triplet Beat" })),
    ).toEqual({
      ownedCount: 0,
      wishlistCount: 0,
    });
  });

  it("does not let an English row mark the Japanese shelf either", () => {
    const english = row({
      id: "en-1",
      number: "007",
      setName: "Triplet Beat",
      name: "Meowscarada ex",
    });
    expect(ownershipOf(ownershipIndex([english], "ja"), jaCard)).toMatchObject({ owned: false });
  });

  it("counts a Japanese set by the id its rows carry, one card per printing", () => {
    const rows = [
      japanese(),
      japanese({ id: "ja-2" }),
      japanese({ id: "ja-3", tcgId: "SV1a-008", number: "008" }),
      japanese({ id: "ja-4", tcgId: "SV1a-009", number: "009", owned: false }),
    ];
    expect(
      setCounts(ownershipIndex(rows, "ja"), set({ id: "SV1a", name: "トリプレットビート" })),
    ).toEqual({
      ownedCount: 2,
      wishlistCount: 1,
    });
  });

  it("leaves a Japanese row with no catalogue id on the English shelf, where it was", () => {
    // Nothing addresses it in its own catalogue, so the only join it can take
    // part in is the one it always did.
    const rows = [japanese({ tcgId: null, name: "Charizard", number: "004", setName: "Base" })];
    expect(ownershipOf(ownershipIndex(rows), card())).toMatchObject({ owned: true });
    expect(ownershipOf(ownershipIndex(rows, "ja"), jaCard)).toMatchObject({ owned: false });
  });
});

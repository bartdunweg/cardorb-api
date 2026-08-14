import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SetCatalogue } from "./catalogue";
import type { CollectionRow } from "./collection-row";

/**
 * The test that guards the seam.
 *
 * buildCollection() is the half of the migration that must not change: rows go
 * in, a collection comes out, and every store below is only ever asked for the
 * rows. So this asks it the questions the walk used to be asked — does a card
 * held twice come out as one card with two printings, does a number that
 * resolves to a different Pokémon get refused a scan — with the catalogue
 * handed over rather than fetched.
 *
 * Mocked rather than stubbed at the fetch layer, and for two reasons. The
 * honest one is that setCatalogue() is wrapped in unstable_cache, which throws
 * "incrementalCache missing" outside a Next request, so there is no choice. The
 * better one is that it makes the subject right: none of what is asserted below
 * has anything to do with the network, and a test that had to describe a TCGdex
 * response to ask about variant folding was describing the wrong thing.
 */

const CARDS = {
  "088": { id: "base1-088", localId: "088", name: "Pikachu", image: "img/088" },
  "88": { id: "base1-088", localId: "088", name: "Pikachu", image: "img/088" },
  "004": { id: "base1-004", localId: "004", name: "Charizard", image: "img/004" },
  "4": { id: "base1-004", localId: "004", name: "Charizard", image: "img/004" },
};

const catalogue = (over: Partial<SetCatalogue> = {}): SetCatalogue => ({
  byNumber: CARDS,
  assetBase: "https://assets.tcgdex.net/en/base/base1",
  code: "BS",
  setHasScans: true,
  logo: "https://assets.tcgdex.net/en/base/base1/logo.webp",
  releaseDate: "1999-01-09",
  total: 102,
  prices: {},
  ...over,
});

/** Which set names the stub knows. Anything else is a set TCGdex never heard of. */
const KNOWN: Record<string, SetCatalogue> = { Base: catalogue() };

const empty = (): SetCatalogue => ({
  byNumber: {},
  assetBase: null,
  code: null,
  setHasScans: false,
  logo: null,
  releaseDate: null,
  total: null,
  prices: {},
});

const setCatalogue = vi.fn(async (name: string) => KNOWN[name] ?? empty());
const pricesFor = vi.fn(async (ids: string[]) =>
  new Map(ids.map((id) => [id, { low: 1, market: 4.5, avg30: 4.2, nm: { low: 4, mid: 5, high: 6 } }])),
);

vi.mock("./catalogue", () => ({
  setCatalogue: (name: string) => setCatalogue(name),
  pricesFor: (ids: string[]) => pricesFor(ids),
  json: async () => null,
}));

// The last-resort scan lookup, silenced. Left real it treats an empty index as
// a failure and retries three times behind a growing backoff, which cost this
// file 1.5 seconds per unmatched card and told us nothing: whether a card the
// catalogue could not place also fails to turn up at pokemontcg.io is that
// module's question, not this one's.
vi.mock("./ptcg", () => ({
  ptcgScan: async () => null,
  ptcgLogo: async () => null,
}));

const { buildCollection } = await import("./cards");

const row = (over: Partial<CollectionRow> = {}): CollectionRow => ({
  id: null,
  name: "Pikachu",
  number: "088",
  setName: "Base",
  rarity: null,
  gen: null,
  types: [],
  owned: true,
  excluded: false,
  acquiredAt: null,
  ...over,
});

beforeEach(() => {
  setCatalogue.mockClear();
  pricesFor.mockClear();
  // The per-card fallbacks (Limitless, pokemontcg.io) are the only thing left
  // that reaches the network, and they only run for a card the catalogue did
  // not match. Refused, so an unmatched card stays unmatched.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 }) as Response));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildCollection", () => {
  it("folds two printings of one card into one card with two variants", async () => {
    // 317 cards in the real collection are held both normally and as a reverse
    // holo. Shown twice they read as a duplicate; the rarities are meant to
    // become two tags under a single scan.
    const sets = await buildCollection([
      row({ rarity: "Rare Holo" }),
      row({ rarity: "Reverse Holo" }),
    ]);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.cards).toHaveLength(1);
    expect(sets[0]!.cards[0]!.variants).toEqual([
      { rarity: "Rare Holo", owned: true },
      { rarity: "Reverse Holo", owned: true },
    ]);
  });

  it("says the same rarity once, however many rows carry it", async () => {
    const [set] = await buildCollection([row({ rarity: "Rare Holo" }), row({ rarity: "Rare Holo" })]);
    expect(set!.cards[0]!.variants).toHaveLength(1);
  });

  it("counts a card as held when any one of its printings is", async () => {
    // The wishlist and the binder can name the same card: wanting a reverse
    // holo of something you already own does not make the card unowned.
    const [set] = await buildCollection([
      row({ rarity: "Reverse Holo", owned: false }),
      row({ rarity: "Rare Holo", owned: true }),
    ]);
    expect(set!.cards[0]!.owned).toBe(true);
    expect(set!.cards[0]!.variants).toEqual([
      { rarity: "Reverse Holo", owned: false },
      { rarity: "Rare Holo", owned: true },
    ]);
  });

  it("matches a row to the catalogue and takes its id and price", async () => {
    const [set] = await buildCollection([row()]);
    expect(set!.cards[0]!.tcgId).toBe("base1-088");
    expect(set!.cards[0]!.price).not.toBeNull();
    expect(set!.cards[0]!.image).toContain("img/088");
  });

  it("matches a padded number against an unpadded one and back", async () => {
    const [set] = await buildCollection([row({ number: "88" })]);
    expect(set!.cards[0]!.tcgId).toBe("base1-088");
  });

  it("refuses a scan when the number resolves to a different Pokémon", async () => {
    // A wrong scan is worse than a missing one. 004 is Charizard, so a row that
    // calls it Bulbasaur has numbering that does not line up.
    const [set] = await buildCollection([row({ name: "Bulbasaur", number: "004" })]);
    expect(set!.cards[0]!.tcgId).toBeNull();
    expect(set!.cards[0]!.image).toBeNull();
  });

  it("still matches a name the owner misspelled", async () => {
    // Twenty-two of these were sitting in the real collection. Losing the match
    // loses the scan, the price, the page and the place in the Pokédex.
    const [set] = await buildCollection([row({ name: "Pikachyu" })]);
    expect(set!.cards[0]!.tcgId).toBe("base1-088");
  });

  it("hands out no scans at all for a set that has none yet", async () => {
    // TCGdex publishes the record before the artwork and does not say so, so
    // every card in an announced set carries an image URL that 404s.
    KNOWN.Base = catalogue({ setHasScans: false });
    const [set] = await buildCollection([row()]);
    expect(set!.cards[0]!.image).toBeNull();
    // Still matched, though: the id and the price do not depend on the picture.
    expect(set!.cards[0]!.tcgId).toBe("base1-088");
    KNOWN.Base = catalogue();
  });

  it("takes a price the catalogue already had without asking again", async () => {
    // What CATALOGUE_SET_PRICING_MAX buys once a set has more than one owner.
    KNOWN.Base = catalogue({ prices: { "base1-088": { low: 2, market: 9, avg30: 9, nm: null } } });
    const [set] = await buildCollection([row()]);
    expect(set!.cards[0]!.price?.market).toBe(9);
    expect(pricesFor).not.toHaveBeenCalled();
    KNOWN.Base = catalogue();
  });

  it("asks only for the prices the catalogue is missing", async () => {
    KNOWN.Base = catalogue({ prices: { "base1-088": { low: 2, market: 9, avg30: 9, nm: null } } });
    await buildCollection([row(), row({ name: "Charizard", number: "004" })]);
    expect(pricesFor).toHaveBeenCalledWith(["base1-004"]);
    KNOWN.Base = catalogue();
  });

  it("joins a row's types back into the one string the card carries", async () => {
    const [set] = await buildCollection([row({ types: ["Fire", "Water"] })]);
    expect(set!.cards[0]!.type).toBe("Fire, Water");
  });

  it("leaves a card with no types with a null rather than an empty string", async () => {
    const [set] = await buildCollection([row({ types: [] })]);
    expect(set!.cards[0]!.type).toBeNull();
  });

  it("skips a row that cannot be placed or drawn", async () => {
    expect(await buildCollection([row({ setName: "" })])).toEqual([]);
    expect(await buildCollection([row({ name: "" })])).toEqual([]);
  });

  it("answers an empty collection without asking the catalogue anything", async () => {
    // What makes a deployment with no store cheap rather than merely empty.
    expect(await buildCollection([])).toEqual([]);
    expect(setCatalogue).not.toHaveBeenCalled();
  });

  it("resolves each set once however many cards came from it", async () => {
    // The reason the rows are grouped before anything is fetched.
    await buildCollection([row(), row({ number: "004", name: "Charizard" }), row()]);
    expect(setCatalogue).toHaveBeenCalledTimes(1);
  });

  it("puts the newest set first and one nobody knows last", async () => {
    // A set with no release date goes last rather than jumping to the front on
    // an empty string.
    const sets = await buildCollection([
      row({ setName: "Nowhere", number: "001", name: "Mew" }),
      row({ setName: "Base" }),
    ]);
    expect(sets.map((s) => s.name)).toEqual(["Base", "Nowhere"]);
  });

  it("carries the set's own details up from the catalogue", async () => {
    const [set] = await buildCollection([row()]);
    expect(set!.logo).toContain("logo.webp");
    expect(set!.releaseDate).toBe("1999-01-09");
    expect(set!.total).toBe(102);
  });
});

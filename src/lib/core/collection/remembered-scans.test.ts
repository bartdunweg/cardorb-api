import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SetCatalogue } from "../catalogue/catalogue";
import type { CollectionRow } from "./collection-row";

/**
 * A picture, once seen, stays.
 *
 * On 2026-09-12 every card of set 151 lost its scan on cardorb.com while the files themselves
 * were served fine: the catalogue answered once without them and that answer stood for its
 * cached day. These are the two halves of the answer to that. The read half prefers the
 * catalogue and falls back to what the row remembers; the write half decides what a row should
 * be told to remember, and refuses to record an absence.
 *
 * The catalogue is handed over rather than fetched, for the reason collection.test.ts gives:
 * setCatalogue() is wrapped in unstable_cache and none of this is about the network.
 */

const catalogue = (over: Partial<SetCatalogue> = {}): SetCatalogue => ({
  byNumber: {
    "088": { id: "base1-088", localId: "088", name: "Pikachu", image: "img/088" },
    "88": { id: "base1-088", localId: "088", name: "Pikachu", image: "img/088" },
  },
  assetBase: "https://assets.tcgdex.net/en/base/base1",
  officialName: "Base Set",
  code: "BS",
  setHasScans: true,
  logo: "https://assets.tcgdex.net/en/base/base1/logo.webp",
  releaseDate: "1999-01-09",
  total: 102,
  prices: {},
  ...over,
});

/** The set as it comes back on the bad day: known, with nothing in it. */
const quiet = (): SetCatalogue => catalogue({ byNumber: {}, assetBase: null, setHasScans: false });

let answer: SetCatalogue = catalogue();
const setCatalogue = vi.fn(async () => answer);

vi.mock("../catalogue/catalogue", () => ({
  setCatalogue: () => setCatalogue(),
  pricesFor: async () => new Map(),
  json: async () => null,
}));

/** The last-resort scan, controllable: it is the one source that answers with a low file alone. */
const ptcgScan = vi.fn(async (): Promise<string | null> => null);

vi.mock("../catalogue/ptcg", () => ({
  ptcgScan: () => ptcgScan(),
  ptcgLogo: async () => null,
}));

const { buildCollection } = await import("./cards");
const { rememberedScans } = await import("./remembered-scans");

const row = (over: Partial<CollectionRow> = {}): CollectionRow => ({
  id: "a",
  name: "Pikachu",
  number: "088",
  setName: "Base",
  rarity: null,
  tcgId: null,
  gen: null,
  types: [],
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

beforeEach(() => {
  answer = catalogue();
  setCatalogue.mockClear();
  ptcgScan.mockClear();
  ptcgScan.mockResolvedValue(null);
  // The per-card fallbacks are the only thing left that reaches the network, and they run only
  // for a card the catalogue did not match. Refused, so an unmatched card stays unmatched.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 404 }) as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a row that remembers its picture", () => {
  it("draws the remembered scan when the catalogue has none", async () => {
    answer = quiet();
    const [set] = await buildCollection([
      row({ imageUrl: "img/088/low.webp", imageHighUrl: "img/088/high.webp" }),
    ]);
    expect(set!.cards[0]!.image).toBe("img/088/low.webp");
    expect(set!.cards[0]!.imageHigh).toBe("img/088/high.webp");
  });

  it("still draws nothing for a card no one has ever resolved", async () => {
    answer = quiet();
    const [set] = await buildCollection([row()]);
    expect(set!.cards[0]!.image).toBeNull();
  });

  it("prefers the catalogue, so a better scan replaces the remembered one", async () => {
    const [set] = await buildCollection([row({ imageUrl: "stale", imageHighUrl: "stale/high" })]);
    expect(set!.cards[0]!.image).toBe("img/088/low.webp");
    expect(set!.cards[0]!.imageHigh).toBe("img/088/high.webp");
  });

  it("never pairs a catalogue scan with a remembered one of another picture", async () => {
    // A fallback scan is one file and carries no high version. Taking that low beside the
    // remembered high would draw two different pictures as one card.
    answer = quiet();
    ptcgScan.mockResolvedValue("fallback/scan.png");
    const [set] = await buildCollection([
      row({ imageUrl: "remembered/low", imageHighUrl: "remembered/high" }),
    ]);
    expect(set!.cards[0]!.image).toBe("fallback/scan.png");
    expect(set!.cards[0]!.imageHigh).toBeNull();
  });
});

describe("rememberedScans", () => {
  it("writes the picture the catalogue just gave to the rows holding none", async () => {
    const rows = [row({ id: "a" })];
    const sets = await buildCollection(rows);
    expect(rememberedScans(rows, sets)).toEqual([
      { image: "img/088/low.webp", imageHigh: "img/088/high.webp", ids: ["a"] },
    ]);
  });

  it("says nothing about a collection that already remembers what was resolved", async () => {
    const rows = [
      row({ id: "a", imageUrl: "img/088/low.webp", imageHighUrl: "img/088/high.webp" }),
    ];
    expect(rememberedScans(rows, await buildCollection(rows))).toEqual([]);
  });

  it("records no absence: a catalogue that answered nothing writes nothing", async () => {
    answer = quiet();
    const rows = [row({ id: "a", imageUrl: "img/088/low.webp" })];
    expect(rememberedScans(rows, await buildCollection(rows))).toEqual([]);
  });

  it("groups the copies of one card into one write", async () => {
    const rows = [row({ id: "a" }), row({ id: "b", rarity: "Reverse Holo" })];
    const [memory, ...rest] = rememberedScans(rows, await buildCollection(rows));
    expect(rest).toEqual([]);
    expect(memory!.ids.sort()).toEqual(["a", "b"]);
  });
});

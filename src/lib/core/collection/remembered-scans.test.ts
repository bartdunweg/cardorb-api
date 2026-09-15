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

/** A folder and a file in our bucket: the only pictures a client is sent. */
const IMG = "https://images.cardorb.com/en/base/base1/088";
const FILE = "https://images.cardorb.com/pokemontcg/base1/88.png";

const catalogue = (over: Partial<SetCatalogue> = {}): SetCatalogue => ({
  byNumber: {
    "088": { id: "base1-088", localId: "088", name: "Pikachu", image: IMG },
    "88": { id: "base1-088", localId: "088", name: "Pikachu", image: IMG },
  },
  officialName: "Base Set",
  code: "BS",
  logo: "https://images.cardorb.com/en/base/base1/logo.webp",
  releaseDate: "1999-01-09",
  total: 102,
  ...over,
});

/** The set as it comes back on the bad day: known, with nothing in it. */
const quiet = (): SetCatalogue => catalogue({ byNumber: {} });

let answer: SetCatalogue = catalogue();
const setCatalogue = vi.fn(async () => answer);

vi.mock("../catalogue/catalogue", () => ({
  setCatalogue: () => setCatalogue(),
  pricesFor: async () => new Map(),
  json: async () => null,
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
  // Nothing here may reach the network: no picture is looked for on a request (2026-09-15).
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 404 }) as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a card with no picture of ours", () => {
  it("asks no other catalogue about it, matched or not", async () => {
    // The nightly copy asks every source for a blank card; a request asks nobody.
    answer = catalogue({
      byNumber: {
        "088": { id: "base1-088", localId: "088", name: "Pikachu", image: null },
        "88": { id: "base1-088", localId: "088", name: "Pikachu", image: null },
      },
    });
    const [set] = await buildCollection([row(), row({ id: "b", name: "Mew", number: "151" })]);
    expect(set!.cards.map((c) => c.image)).toEqual([null, null]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("a row that remembers its picture", () => {
  it("draws the remembered scan when the catalogue has none", async () => {
    answer = quiet();
    const [set] = await buildCollection([
      row({ imageUrl: `${IMG}/low.webp`, imageHighUrl: `${IMG}/high.webp` }),
    ]);
    expect(set!.cards[0]!.image).toBe(`${IMG}/low.webp`);
    expect(set!.cards[0]!.imageHigh).toBe(`${IMG}/high.webp`);
  });

  it("draws nothing from a memory that is not a file of ours", async () => {
    // A row written before every picture lived in our bucket may still name another host.
    answer = quiet();
    const [set] = await buildCollection([
      row({
        imageUrl:
          "/api/cover?url=https%3A%2F%2Flimitlesstcg.nyc3.cdn.digitaloceanspaces.com%2Fx.png",
        imageHighUrl: null,
      }),
    ]);
    expect(set!.cards[0]!.image).toBeNull();
    expect(set!.cards[0]!.imageHigh).toBeNull();
  });

  it("still draws nothing for a card no one has ever resolved", async () => {
    answer = quiet();
    const [set] = await buildCollection([row()]);
    expect(set!.cards[0]!.image).toBeNull();
  });

  it("prefers the catalogue, so a better scan replaces the remembered one", async () => {
    const [set] = await buildCollection([row({ imageUrl: "stale", imageHighUrl: "stale/high" })]);
    expect(set!.cards[0]!.image).toBe(`${IMG}/low.webp`);
    expect(set!.cards[0]!.imageHigh).toBe(`${IMG}/high.webp`);
  });

  it("never pairs a catalogue scan with a remembered one of another picture", async () => {
    // A copied fallback scan is one file and carries no high version. Taking that low beside the
    // remembered high would draw two different pictures as one card.
    answer = catalogue({
      byNumber: { "088": { id: "base1-088", localId: "088", name: "Pikachu", image: FILE } },
    });
    const [set] = await buildCollection([
      row({ imageUrl: `${IMG}/low.webp`, imageHighUrl: `${IMG}/high.webp` }),
    ]);
    expect(set!.cards[0]!.image).toBe(FILE);
    expect(set!.cards[0]!.imageHigh).toBeNull();
  });
});

describe("rememberedScans", () => {
  it("writes the picture the catalogue just gave to the rows holding none", async () => {
    const rows = [row({ id: "a" })];
    const sets = await buildCollection(rows);
    expect(rememberedScans(rows, sets)).toEqual([
      { image: `${IMG}/low.webp`, imageHigh: `${IMG}/high.webp`, ids: ["a"] },
    ]);
  });

  it("never writes a picture that is not a file of ours onto a row", () => {
    const rows = [row({ id: "a" })];
    const sets = [
      {
        cards: [
          {
            image: "https://images.pokemontcg.io/base1/58.png",
            imageHigh: null,
            variants: [{ id: "a" }],
          },
        ],
      },
    ] as never;
    expect(rememberedScans(rows, sets)).toEqual([]);
  });

  it("says nothing about a collection that already remembers what was resolved", async () => {
    const rows = [row({ id: "a", imageUrl: `${IMG}/low.webp`, imageHighUrl: `${IMG}/high.webp` })];
    expect(rememberedScans(rows, await buildCollection(rows))).toEqual([]);
  });

  it("records no absence: a catalogue that answered nothing writes nothing", async () => {
    answer = quiet();
    const rows = [row({ id: "a", imageUrl: `${IMG}/low.webp` })];
    expect(rememberedScans(rows, await buildCollection(rows))).toEqual([]);
  });

  it("groups the copies of one card into one write", async () => {
    const rows = [row({ id: "a" }), row({ id: "b", rarity: "Reverse Holo" })];
    const [memory, ...rest] = rememberedScans(rows, await buildCollection(rows));
    expect(rest).toEqual([]);
    expect(memory!.ids.sort()).toEqual(["a", "b"]);
  });
});

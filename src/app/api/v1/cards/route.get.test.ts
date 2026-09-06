import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The flat list: whose, which page, and that a bad query is refused rather
 * than guessed at. The filtering itself is tested in lib/core/collection/items.test.ts.
 */

const authorise = vi.fn();
const getCollection = vi.fn();
const findFolder = vi.fn();

vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  authoriseWrite: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
  storeErrorResponse: () => new Response(null, { status: 503 }),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
vi.mock("@/lib/core/collection/collection", () => ({
  getCollection: (...a: unknown[]) => getCollection(...a),
  findFolder: (...a: unknown[]) => findFolder(...a),
}));
vi.mock("@/lib/storage/collection", () => ({ createRow: vi.fn() }));
// items.ts now values the page's cards through cards.ts, which builds its set catalogue behind
// unstable_cache at import time; the pass-through keeps that import loadable here.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const variant = (id: string, owned = true) => ({
  id,
  rarity: null,
  owned,
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
});

const SETS = [
  {
    name: "Base Set",
    title: "Base Set",
    logo: null,
    logoSize: null,
    releaseDate: null,
    total: null,
    cards: [
      {
        key: "pika",
        name: "Pikachu",
        number: "58",
        type: null,
        gen: null,
        image: null,
        imageHigh: null,
        imageSize: null,
        speciesId: 25,
        variants: [variant("a"), variant("b", false)],
        owned: true,
        price: null,
        priceHolo: null,
        tcgId: null,
      },
    ],
  },
];

const get = (qs = "") =>
  GET(
    new Request(`https://api.cardorb.com/v1/cards${qs}`, {
      headers: { authorization: "Bearer t.o.k.e.n" },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue(VIEWER);
  getCollection.mockResolvedValue({ sets: SETS, failed: false });
});

describe("GET /api/v1/cards", () => {
  it("answers a rule folder with its owned matches, whatever `owned` says", async () => {
    findFolder.mockResolvedValue({
      id: "0b6e2c1a-1111-4a5b-9c3d-000000000001",
      name: "Kanto",
      kind: "rule",
      rule: { dex: { from: 1, to: 151 } },
      pokedex: null,
      createdAt: "2026-09-05T00:00:00Z",
    });
    const body = await (
      await get("?collection=0b6e2c1a-1111-4a5b-9c3d-000000000001&owned=false")
    ).json();
    // Pikachu is Gen 1: the owned copy is in, the wished copy is not, and `owned=false`
    // does not empty the folder.
    expect(body.total).toBe(1);
    expect(body.cards[0]).toMatchObject({ id: "a", owned: true });
  });

  it("reads the caller's own collection with the caller's own credential", async () => {
    await get();
    expect(getCollection).toHaveBeenCalledWith("me-uuid", "t.o.k.e.n");
  });

  it("answers one page of copies and the total behind it", async () => {
    const body = await (await get("?owned=true")).json();
    expect(body.total).toBe(1);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({ id: "a", name: "Pikachu", set: "Base Set", owned: true });
  });

  it("names the sets and rarities held, whatever the page asked for", async () => {
    const body = await (await get("?owned=false")).json();
    expect(body.total).toBe(1);
    expect(body.facets).toEqual({ sets: [{ name: "Base Set", title: "Base Set" }], rarities: [] });
  });

  it("says when the catalogue was unreachable, beside the rows it could still list", async () => {
    getCollection.mockResolvedValue({ sets: SETS, failed: false, catalogueUnavailable: true });
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.catalogueUnavailable).toBe(true);
    expect(body.cards).toHaveLength(2);
  });

  it("says nothing about the catalogue when it answered", async () => {
    const body = await (await get()).json();
    expect("catalogueUnavailable" in body).toBe(false);
  });

  it("refuses a query it would have to guess at", async () => {
    const res = await get("?owned=maybe");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "owned must be true or false." });
    expect(getCollection).not.toHaveBeenCalled();
  });

  it("passes a refusal through", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Who are you?" });
    const res = await get();
    expect(res.status).toBe(401);
    expect(getCollection).not.toHaveBeenCalled();
  });
});

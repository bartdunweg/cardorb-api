import { beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const getFolders = vi.fn();
const createFolder = vi.fn();
const getCollection = vi.fn();

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
  getFolders: (...a: unknown[]) => getFolders(...a),
  getCollection: (...a: unknown[]) => getCollection(...a),
}));
vi.mock("@/lib/storage/collection", () => ({
  createFolder: (...a: unknown[]) => createFolder(...a),
}));
// The route reaches items.ts, whose neighbours build caches at import time.
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

const { GET, POST } = await import("./route");

const FOLDER = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Binder",
  kind: "manual",
  rule: null,
  createdAt: "2026-09-02",
};
const KANTO = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Kanto",
  kind: "rule",
  rule: { dex: { from: 1, to: 151 } },
  createdAt: "2026-09-03",
};

// The assembled collection the counts read: one copy filed in the binder, one wished, one
// loose Gen 1 Pokémon, and a trainer, which has no dex number.
const copy = (id: string, over: Record<string, unknown>) => ({
  id,
  rarity: "Common",
  owned: true,
  finish: null,
  quantity: 1,
  condition: null,
  grade: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  acquiredAt: null,
  excluded: false,
  collectionId: null,
  ...over,
});
const card = (name: string, speciesId: number | null, variants: unknown[]) => ({
  key: name,
  name,
  number: "1",
  type: null,
  gen: null,
  image: null,
  imageHigh: null,
  imageSize: null,
  speciesId,
  variants,
  owned: true,
  price: null,
  priceHolo: null,
  tcgId: null,
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
      card("Pikachu", 25, [copy("a", { collectionId: FOLDER.id })]),
      card("Charizard", 6, [copy("b", { owned: false, collectionId: FOLDER.id })]),
      card("Mew", 151, [copy("c", {})]),
      card("Potion", null, [copy("d", {})]),
    ],
  },
];

const get = () =>
  GET(
    new Request("https://api.cardorb.com/v1/folders", { headers: { authorization: "Bearer t" } }),
  );
const post = (body: string) =>
  POST(
    new Request("https://api.cardorb.com/v1/folders", {
      method: "POST",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body,
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  getFolders.mockResolvedValue([FOLDER, KANTO]);
  getCollection.mockResolvedValue({ sets: SETS, failed: false });
  createFolder.mockResolvedValue(FOLDER);
});

describe("GET /api/v1/folders", () => {
  it("lists the caller's folders: filed copies for one by hand, matches for one with a rule", async () => {
    const body = await (await get()).json();
    expect(getFolders).toHaveBeenCalledWith("me-uuid", "t");
    // The binder: a owned, b wished. Kanto: a and c are owned Gen 1; b is wished, d has no number.
    expect(body).toEqual({
      folders: [
        { ...FOLDER, count: 1 },
        { ...KANTO, count: 2 },
      ],
    });
  });

  it("says when the catalogue was down, because a rule count is then low", async () => {
    getCollection.mockResolvedValue({ sets: SETS, failed: false, catalogueUnavailable: true });
    const body = await (await get()).json();
    expect(body.catalogueUnavailable).toBe(true);
    expect(body.folders).toHaveLength(2);
  });

  it("still lists the folders when the rows could not be read, and says so", async () => {
    getCollection.mockResolvedValue({ sets: [], failed: true });
    const body = await (await get()).json();
    /* Without this every folder reads `count: 0` during a store outage, which
       is the same answer as an empty binder. */
    expect(body).toEqual({
      folders: [
        { ...FOLDER, count: 0 },
        { ...KANTO, count: 0 },
      ],
      collectionUnavailable: true,
    });
  });
});

describe("POST /api/v1/folders", () => {
  it("creates a folder with a trimmed name", async () => {
    const res = await post(JSON.stringify({ name: "  Binder   two " }));
    expect(createFolder).toHaveBeenCalledWith("me-uuid", "Binder two", null, null, false, "t");
    expect(await res.json()).toEqual({ ok: true, folder: { ...FOLDER, count: 0 } });
  });

  it("refuses a nameless folder", async () => {
    const res = await post(JSON.stringify({ name: "   " }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "A folder needs a name." });
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("creates a rule folder with the rule normalised", async () => {
    createFolder.mockResolvedValue(KANTO);
    const res = await post(
      JSON.stringify({
        name: "Kanto",
        rule: { dex: { from: 1, to: 151 }, sets: [" Base  Set ", "base set"] },
      }),
    );
    expect(createFolder).toHaveBeenCalledWith(
      "me-uuid",
      "Kanto",
      { dex: { from: 1, to: 151 }, sets: ["Base Set"] },
      null,
      false,
      "t",
    );
    expect(await res.json()).toEqual({ ok: true, folder: { ...KANTO, count: 0 } });
  });

  it("refuses a rule it cannot mean", async () => {
    const res = await post(JSON.stringify({ name: "Kanto", rule: { dex: { from: 151, to: 1 } } }));
    expect(res.status).toBe(400);
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    expect((await post("{nope")).status).toBe(400);
  });
});

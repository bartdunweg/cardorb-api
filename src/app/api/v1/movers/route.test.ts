import { beforeEach, describe, expect, it, vi } from "vitest";

/** The movers route: its periods, its refusals, and a store that is down is not "nothing moved". */

const authorise = vi.fn();
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
  // The real helper's contract (guard.ts): a store throw is `{ error: "<operation>." }` at 502.
  storeErrorResponse: (_e: unknown, _r: Request, op: string) =>
    Response.json({ error: `${op}.` }, { status: 502 }),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
const getCollection = vi.fn();
const getMoverPrices = vi.fn();
const findFolder = vi.fn();
vi.mock("@/lib/core/collection/collection", () => ({
  ALL_READINGS: "2000-01-01",
  getCollection: (...a: unknown[]) => getCollection(...a),
  getMoverPrices: (...a: unknown[]) => getMoverPrices(...a),
  findFolder: (...a: unknown[]) => findFolder(...a),
}));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };
const card = {
  key: "base1|4|Charizard",
  name: "Charizard",
  number: "4",
  image: "https://images.cardorb.com/en/base/base1/4/low.webp",
  tcgId: "base1-4",
  variants: [{ owned: true, quantity: 2, finish: null, edition: null, rarity: "Holo Rare" }],
};
const ask = (query = "") =>
  GET(
    new Request(`https://api.cardorb.com/v1/movers${query}`, {
      headers: { authorization: "Bearer t" },
    }),
  );

beforeEach(() => {
  vi.resetAllMocks();
  authorise.mockResolvedValue(VIEWER);
  getCollection.mockResolvedValue({ sets: [{ name: "Base Set", cards: [card] }], failed: false });
  getMoverPrices.mockResolvedValue({
    failed: false,
    points: [
      { language: "en", tcgId: "base1-4", date: "2026-09-07", market: 300, holo: null },
      { language: "en", tcgId: "base1-4", date: "2026-09-14", market: 320, holo: null },
    ],
  });
});

describe("GET /v1/movers", () => {
  it("answers each card's move per copy and over the copies held", async () => {
    const res = await ask("?days=7");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.down).toEqual([]);
    expect(body.up).toEqual([
      expect.objectContaining({
        tcgId: "base1-4",
        set: "Base Set",
        rarity: "Holo Rare",
        copies: 2,
        was: 300,
        now: 320,
        change: 20,
        total: 40,
      }),
    ]);
  });

  // neo4-106 is Shining Celebi in English and Lucky Stadium in Japanese.
  it("asks for each card under its set's catalogue", async () => {
    getCollection.mockResolvedValue({
      sets: [
        { name: "Neo Destiny", language: null, cards: [{ ...card, tcgId: "neo4-106" }] },
        { name: "Neo Destiny", language: "ja", cards: [{ ...card, tcgId: "neo4-106" }] },
      ],
      failed: false,
    });
    await ask("?days=7");
    expect(getMoverPrices.mock.calls[0]![1]).toEqual([
      { tcgId: "neo4-106", language: "en" },
      { tcgId: "neo4-106", language: "ja" },
    ]);
  });

  it("reads the window the period names, and every reading for all", async () => {
    await ask("?days=7");
    const from7 = getMoverPrices.mock.calls[0]![3] as string;
    expect(Date.parse(from7)).toBeGreaterThan(Date.now() - 8 * 86_400_000);
    await ask("?days=all");
    expect(getMoverPrices.mock.calls[1]![3]).toBe("2000-01-01");
  });

  it("reads 91 and 182 days, the web chart's three and six months", async () => {
    expect((await ask("?days=91")).status).toBe(200);
    const from91 = getMoverPrices.mock.calls[0]![3] as string;
    expect(Date.parse(from91)).toBeLessThan(Date.now() - 90 * 86_400_000);
    expect((await ask("?days=182")).status).toBe(200);
  });

  it("refuses a period the chart does not have, and a top out of range", async () => {
    expect((await ask("?days=14")).status).toBe(400);
    expect((await ask("?top=0")).status).toBe(400);
    expect((await ask("?top=11")).status).toBe(400);
  });

  it("answers 503, not an empty list, when the readings could not be read", async () => {
    getMoverPrices.mockResolvedValue({ failed: true, points: [] });
    expect((await ask()).status).toBe(503);
    getCollection.mockResolvedValue({ sets: [], failed: true });
    expect((await ask()).status).toBe(503);
  });

  // The line under the name on Home reads as every list's: "Holo · Near Mint".
  it("says which printing the copies are and what state they are in", async () => {
    getCollection.mockResolvedValue({
      sets: [
        {
          name: "Base Set",
          cards: [
            {
              ...card,
              variants: [
                {
                  owned: true,
                  quantity: 1,
                  finish: "holo",
                  edition: "1st-edition",
                  condition: "Near Mint",
                  rarity: "Holo Rare",
                },
                {
                  owned: true,
                  quantity: 1,
                  finish: "holo",
                  edition: "1st-edition",
                  condition: "Near Mint",
                  rarity: "Holo Rare",
                },
              ],
            },
          ],
        },
      ],
      failed: false,
    });
    const body = await (await ask("?days=7")).json();
    expect(body.up[0]).toMatchObject({
      finish: "holo",
      edition: "1st-edition",
      condition: "Near Mint",
      grade: null,
    });
  });

  it("says nothing where the copies held disagree, since the line is about the card", async () => {
    getCollection.mockResolvedValue({
      sets: [
        {
          name: "Base Set",
          cards: [
            {
              ...card,
              variants: [
                {
                  owned: true,
                  quantity: 1,
                  finish: "holo",
                  condition: "Near Mint",
                  rarity: "Holo Rare",
                },
                {
                  owned: true,
                  quantity: 1,
                  finish: "holo",
                  condition: "Played",
                  rarity: "Holo Rare",
                },
                {
                  owned: false,
                  quantity: 1,
                  finish: "reverse-holo",
                  condition: "Mint",
                  rarity: "Holo Rare",
                },
              ],
            },
          ],
        },
      ],
      failed: false,
    });
    const body = await (await ask("?days=7")).json();
    // The finish is one answer across the copies held; the condition is not, and the wish is not counted.
    expect(body.up[0]).toMatchObject({ finish: "holo", condition: null });
  });

  describe("for one list", () => {
    const FOLDER = "11111111-2222-4333-8444-555555555555";
    const row = (over: Record<string, unknown>) => ({
      owned: true,
      quantity: 1,
      finish: null,
      edition: null,
      rarity: "Holo Rare",
      isFavorite: false,
      collectionId: null,
      ...over,
    });
    const listCard = (tcgId: string, name: string, variants: Record<string, unknown>[]) => ({
      ...card,
      key: tcgId,
      tcgId,
      name,
      variants,
    });
    const points = (...ids: string[]) =>
      ids.flatMap((tcgId) => [
        { language: "en", tcgId, date: "2026-09-07", market: 300, holo: null },
        { language: "en", tcgId, date: "2026-09-14", market: 320, holo: null },
      ]);
    beforeEach(() => {
      getCollection.mockResolvedValue({
        sets: [
          {
            name: "Base Set",
            title: "Base Set",
            cards: [
              listCard("base1-4", "Charizard", [
                row({ id: "r1", quantity: 2, isFavorite: true }),
                row({ id: "r2", quantity: 1 }),
              ]),
              listCard("base1-2", "Blastoise", [row({ id: "r3", collectionId: FOLDER })]),
              listCard("base1-15", "Venusaur", [
                row({ id: "r4", owned: false, quantity: 4, finish: "holo", rarity: "Rare Holo" }),
              ]),
            ],
          },
        ],
        failed: false,
      });
      getMoverPrices.mockImplementation(async (_u, cards: { tcgId: string }[]) => ({
        failed: false,
        points: points(...cards.map((c) => c.tcgId)),
      }));
    });

    it("answers the favourite copies held, and asks prices for those cards only", async () => {
      const res = await ask("?days=7&folder=favorites");
      expect(res.status).toBe(200);
      expect(getMoverPrices.mock.calls[0]![1]).toEqual([{ tcgId: "base1-4", language: "en" }]);
      const body = await res.json();
      expect(body.up).toEqual([
        expect.objectContaining({ tcgId: "base1-4", copies: 2, total: 40 }),
      ]);
    });

    it("answers a wished card once, at the printing wished", async () => {
      const body = await (await ask("?days=7&folder=wishlist")).json();
      expect(getMoverPrices.mock.calls[0]![1]).toEqual([{ tcgId: "base1-15", language: "en" }]);
      expect(body.up).toEqual([
        expect.objectContaining({
          tcgId: "base1-15",
          copies: 1,
          change: 20,
          total: 20,
          finish: "holo",
          rarity: "Rare Holo",
        }),
      ]);
    });

    it("answers a binder's own copies", async () => {
      findFolder.mockResolvedValue({ id: FOLDER, rule: null });
      const body = await (await ask(`?days=7&folder=${FOLDER}`)).json();
      expect(findFolder).toHaveBeenCalledWith("me-uuid", FOLDER, "t");
      expect(getMoverPrices.mock.calls[0]![1]).toEqual([{ tcgId: "base1-2", language: "en" }]);
      expect(body.up.map((m: { tcgId: string }) => m.tcgId)).toEqual(["base1-2"]);
    });

    it("answers a rule binder by its rule, copies held only", async () => {
      findFolder.mockResolvedValue({ id: FOLDER, rule: { sets: ["Base Set"] } });
      const body = await (await ask(`?days=7&folder=${FOLDER}`)).json();
      expect(getMoverPrices.mock.calls[0]![1]).toEqual([
        { tcgId: "base1-4", language: "en" },
        { tcgId: "base1-2", language: "en" },
      ]);
      expect(body.up.map((m: { tcgId: string }) => m.tcgId).sort()).toEqual(["base1-2", "base1-4"]);
    });

    it("answers 404 for a folder id that is not the caller's", async () => {
      findFolder.mockResolvedValue(null);
      const res = await ask(`?folder=${FOLDER}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "No folder by that id." });
      expect(getMoverPrices).not.toHaveBeenCalled();
    });

    it("refuses a value that is no list", async () => {
      const res = await ask("?folder=binder-1");
      expect(res.status).toBe(400);
      expect(findFolder).not.toHaveBeenCalled();
    });

    it("answers the store's error when the folder could not be read", async () => {
      findFolder.mockRejectedValue(new Error("down"));
      const res = await ask(`?folder=${FOLDER}`);
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: "Reading the folder failed." });
      expect(getCollection).not.toHaveBeenCalled();
    });
  });
});

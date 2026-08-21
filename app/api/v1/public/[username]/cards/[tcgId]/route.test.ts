import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one read in this app that is deliberately open.
 *
 * Everything else went behind the key so the public page could hide what the
 * collection is worth; this route exists because that page still has to open a
 * card, and it is the only thing standing between "no prices on screen" and
 * "no prices anywhere". If it ever answers with a price, the whole point of
 * /user/<name> is gone and nothing else in the app would notice.
 *
 * getCardDetail and ownerOf are both stubbed, because what is under test is the
 * stripping and the name check rather than TCGdex or Postgres.
 *
 * The name check used to be `username !== PUBLIC_USERNAME`, an env var, so this
 * file read that constant to know what name to pass. It is a profile lookup
 * now — the same one the page and the two sibling routes make — so "a name that
 * is not the public one" means "a name with no public collection behind it"
 * rather than "a name that is not this deployment's owner".
 */

const detail = {
  id: "sv03-125",
  name: "Charizard",
  image: "https://assets.tcgdex.net/en/sv/sv03/125",
  rarity: "Illustration Rare",
  illustrator: "Someone",
  hp: 330,
  types: ["Fire"],
  stage: "Stage2",
  evolveFrom: "Charmeleon",
  regulationMark: "G",
  set: { id: "sv03", name: "Obsidian Flames", logo: null, total: 197 },
  cmId: 1234,
  cmUrl: "https://www.cardmarket.com/en/Pokemon/Products/Singles/x",
  price: { market: 300, low: 210, nm: { low: 280, high: 340 } },
  market: { avg: 305, trend: 298, avg7: 301 },
};

const getCardDetail = vi.fn();
vi.mock("../../../../../../../lib/core/cards", () => ({ getCardDetail: () => getCardDetail() }));

const ownerOf = vi.fn();
vi.mock("../../../../../../../lib/core/collection", () => ({
  ownerOf: (...args: unknown[]) => ownerOf(...args),
}));

const { GET } = await import("./route");

/** Any name with a public collection behind it. */
const PUBLIC_USERNAME = "somebody";

const params = (username: string, tcgId = "sv03-125") => ({ params: Promise.resolve({ username, tcgId }) });
const req = () => new Request("https://cardorb.example/api/v1/public/owner/cards/sv03-125");

beforeEach(() => {
  getCardDetail.mockResolvedValue(detail);
  ownerOf.mockImplementation(async (username: string) =>
    username === PUBLIC_USERNAME ? { id: "owner-1", username, displayName: null } : null,
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/public/[username]/cards/[tcgId]", () => {
  it("answers for the public collection without any credentials", async () => {
    const res = await GET(req(), params(PUBLIC_USERNAME));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Charizard");
  });

  it("carries no price and no market figures", async () => {
    const body = await (await GET(req(), params(PUBLIC_USERNAME))).json();
    expect(body.price).toBeNull();
    expect(body.market).toBeNull();
  });

  it("has no money anywhere in the response, under any key", async () => {
    // The two fields above are the ones that carry it today. This is the test
    // that fails if a third ever arrives: the numbers in `detail` are distinct
    // and none of them may appear in what goes over the wire.
    const text = JSON.stringify(await (await GET(req(), params(PUBLIC_USERNAME))).json());
    for (const amount of [300, 210, 280, 340, 305, 298, 301]) {
      expect(text).not.toContain(String(amount));
    }
  });

  it("keeps everything that is not money", async () => {
    const body = await (await GET(req(), params(PUBLIC_USERNAME))).json();
    expect(body.rarity).toBe("Illustration Rare");
    expect(body.hp).toBe(330);
    expect(body.illustrator).toBe("Someone");
    expect(body.set.name).toBe("Obsidian Flames");
  });

  it("refuses a name with no public collection behind it", async () => {
    const res = await GET(req(), params("someone-else"));
    expect(res.status).toBe(404);
    // And never even asks: an unknown name should not be a way to make this
    // deployment walk the collection.
    expect(getCardDetail).not.toHaveBeenCalled();
  });

  it("404s a card the catalogue does not know", async () => {
    getCardDetail.mockResolvedValue(null);
    expect((await GET(req(), params(PUBLIC_USERNAME))).status).toBe(404);
  });

  it("may be cached by a shared cache, unlike every keyed read", async () => {
    const res = await GET(req(), params(PUBLIC_USERNAME));
    expect(res.headers.get("Cache-Control")).toContain("public");
  });

  /**
   * Last, and it has to be: the limiter is module state, so once this has run
   * the address it used is spent for the rest of the file. It uses an address
   * of its own for that reason, and every test above shares the default one.
   *
   * Why the route needs this at all, when the response is CDN-cacheable: the
   * cache key is the path, and the path carries an arbitrary card id. A loop
   * over invented ids is a cold miss every time — one Postgres round trip plus
   * one outbound TCGdex fetch each — so the cache never sees it.
   */
  it("stops a loop over invented card ids after sixty a minute", async () => {
    const flood = (tcgId: string) =>
      GET(
        new Request("https://cardorb.example/x", { headers: { "x-real-ip": "203.0.113.9" } }),
        params(PUBLIC_USERNAME, tcgId),
      );

    for (let i = 0; i < 60; i++) {
      expect((await flood(`sv03-${i}`)).status).toBe(200);
    }
    const blocked = await flood("sv03-61");
    expect(blocked.status).toBe(429);
    // And the expensive half never runs: 60 calls, not 61.
    expect(getCardDetail).toHaveBeenCalledTimes(60);
  });
});

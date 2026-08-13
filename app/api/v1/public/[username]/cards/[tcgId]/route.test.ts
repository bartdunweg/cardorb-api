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
 * getCardDetail is stubbed, because what is under test is the stripping and the
 * name check rather than TCGdex.
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

const { GET } = await import("./route");
// Read rather than stubbed: lib/core/config resolves this at import time, so an
// env stub set afterwards would arrive too late and every request would 404 on
// the wrong name for the wrong reason.
const { PUBLIC_USERNAME } = await import("../../../../../../../lib/core/config");

const params = (username: string, tcgId = "sv03-125") => ({ params: Promise.resolve({ username, tcgId }) });
const req = () => new Request("https://cardorb.example/api/v1/public/owner/cards/sv03-125");

beforeEach(() => {
  getCardDetail.mockResolvedValue(detail);
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

  it("refuses a name that is not the public one", async () => {
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
});

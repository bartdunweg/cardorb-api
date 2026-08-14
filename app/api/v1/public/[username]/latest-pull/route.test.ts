import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardSet } from "../../../../../../lib/core/cards";

const sets: CardSet[] = [
  {
    name: "Base",
    title: "Base Set",
    logo: null,
    logoSize: null,
    releaseDate: null,
    total: null,
    cards: [
      {
        key: "charizard",
        name: "Charizard",
        number: "004",
        type: "Fire",
        gen: "Base",
        image: null,
        imageHigh: null,
        imageSize: null,
        speciesId: null,
        owned: true,
        price: { low: 200, market: 210, avg30: 205, nm: null },
        tcgId: "base1-4",
        variants: [
          {
            id: "a",
            rarity: "Rare Holo",
            owned: true,
            quantity: 1,
            condition: null,
            grade: null,
            purchasePrice: 199,
            purchaseDate: null,
            notes: "won it in a trade",
            isFavorite: true,
            acquiredAt: "2026-08-10T12:00:00.000Z",
            excluded: false,
          },
        ],
      },
    ],
  },
];

const getCards = vi.fn();
const ownerOf = vi.fn();
vi.mock("../../../../../../lib/core/collection", () => ({
  getCards: (...args: unknown[]) => getCards(...args),
  ownerOf: (...args: unknown[]) => ownerOf(...args),
}));

const { GET } = await import("./route");

const params = (username: string) => ({ params: Promise.resolve({ username }) });
const req = () => new Request("https://cardorb.example/api/v1/public/owner/latest-pull");

beforeEach(() => {
  ownerOf.mockResolvedValue("owner-1");
  getCards.mockResolvedValue(sets);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/public/[username]/latest-pull", () => {
  it("answers with the most recently acquired card", async () => {
    const body = await (await GET(req(), params("owner"))).json();
    expect(body.latestPull).toMatchObject({
      name: "Charizard",
      rarity: "Rare Holo",
      setName: "Base",
      acquiredAt: "2026-08-10T12:00:00.000Z",
    });
  });

  it("carries no price or purchase data", async () => {
    const text = JSON.stringify(await (await GET(req(), params("owner"))).json());
    expect(text).not.toContain("purchasePrice");
    expect(text).not.toContain("won it in a trade");
    for (const amount of [200, 210, 205, 199]) expect(text).not.toContain(String(amount));
  });

  it("is reachable cross-origin", async () => {
    const res = await GET(req(), params("owner"));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("404s an unknown username without walking the collection", async () => {
    ownerOf.mockResolvedValue(null);
    const res = await GET(req(), params("someone-else"));
    expect(res.status).toBe(404);
    expect(getCards).not.toHaveBeenCalled();
  });

  it("404s when there is nothing eligible to show", async () => {
    getCards.mockResolvedValue([]);
    expect((await GET(req(), params("owner"))).status).toBe(404);
  });
});

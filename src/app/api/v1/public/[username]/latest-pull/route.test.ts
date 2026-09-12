import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardSet } from "@/lib/core/collection/cards";

const sets: CardSet[] = [
  {
    name: "Base",
    language: null,
    title: "Base Set",
    abbreviation: null,
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
        priceHolo: null,
        tcgId: "base1-4",
        variants: [
          {
            id: "a",
            rarity: "Rare Holo",
            owned: true,
            finish: null,
  foilPattern: null,
  edition: null,
            quantity: 1,
            condition: null,
            grade: null,
            language: null,
            purchasePrice: 199,
            purchaseDate: null,
            notes: "won it in a trade",
            isFavorite: true,
            acquiredAt: "2026-08-10T12:00:00.000Z",
            excluded: false,
            collectionId: null,
          },
        ],
      },
    ],
  },
];

const getPublicCollection = vi.fn();
const ownerOf = vi.fn();
vi.mock("@/lib/core/collection/collection", () => ({
  getPublicCollection: (...args: unknown[]) => getPublicCollection(...args),
  ownerOf: (...args: unknown[]) => ownerOf(...args),
}));

const { GET, OPTIONS } = await import("./route");

const params = (username: string) => ({ params: Promise.resolve({ username }) });

// The rate limiter is module-level and keyed by address, so every test gets its
// own so one cannot spend another's budget.
let addresses = 0;
const req = (ip = `10.0.0.${++addresses}`) =>
  new Request("https://cardorb.example/api/v1/public/owner/latest-pull", {
    headers: { "x-real-ip": ip },
  });

beforeEach(() => {
  // The whole profile, not just the id: the route needs getPublicCollection(owner.id) and
  // the page beside it needs the name off the same lookup.
  ownerOf.mockResolvedValue({ id: "owner-1", username: "owner", displayName: null });
  getPublicCollection.mockResolvedValue({ sets, failed: false });
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

  it("is cached at the CDN for a minute, and not served while stale", async () => {
    const res = await GET(req(), params("owner"));
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
  });

  it("404s an unknown username without walking the collection", async () => {
    ownerOf.mockResolvedValue(null);
    const res = await GET(req(), params("someone-else"));
    expect(res.status).toBe(404);
    expect(getPublicCollection).not.toHaveBeenCalled();
  });

  it("404s when there is nothing eligible to show", async () => {
    getPublicCollection.mockResolvedValue({ sets: [], failed: false });
    expect((await GET(req(), params("owner"))).status).toBe(404);
  });

  it("skips a wishlist card, however recently it was added", async () => {
    const base = sets[0]!;
    const owned = base.cards[0]!;
    // A wanted card, added to the store after the last real pull — and with no
    // artwork, the way a just-announced promo arrives.
    const wanted = {
      ...owned,
      key: "umbreon",
      name: "Umbreon",
      owned: false,
      variants: [{ ...owned.variants[0]!, owned: false, acquiredAt: "2026-08-14T00:00:00.000Z" }],
    };
    getPublicCollection.mockResolvedValue({ sets: [{ ...base, cards: [...base.cards, wanted] }], failed: false });

    const body = await (await GET(req(), params("owner"))).json();
    expect(body.latestPull.name).toBe("Charizard");
  });

  it("429s past the per-address limit, still cross-origin", async () => {
    const ip = "10.9.9.9";
    let last = await GET(req(ip), params("owner"));
    for (let i = 0; i < 60 && last.status !== 429; i++) last = await GET(req(ip), params("owner"));

    expect(last.status).toBe(429);
    expect(last.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("answers a preflight", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});

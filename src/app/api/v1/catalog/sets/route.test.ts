import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const authoriseOpen = vi.fn();
const listSets = vi.fn();
const getRows = vi.fn();

/* guard.ts, viewer.ts and collection.ts are all `import "server-only"`
   underneath, which throws the moment vitest imports them, see
   app/api/v1/catalog/search/route.test.ts, whose pattern this follows. The
   ownership join itself is the real one: it is pure, and the point of these
   tests is what the route does with it. */
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  authoriseOpen: (...a: unknown[]) => authoriseOpen(...a),
  refused: (r: { status?: number }) => "status" in r,
  /* Distinguishable on purpose: the point of two header sets is which answer
     carries which, and `{}` for both hid a refusal going out cacheable. */
  readHeaders: () => ({ "cache-control": "private, no-store" }),
  openReadHeaders: () => ({ "cache-control": "public, max-age=0, s-maxage=60" }),
}));
vi.mock("@/lib/api/viewer", () => ({ bearer: () => null }));
vi.mock("@/lib/core/collection/collection", () => ({
  getRows: (...a: unknown[]) => getRows(...a),
}));
/* The shelf is a network read; the language check is the real, pure one. */
vi.mock("@/lib/core/catalogue/tcgdex-browse", async (real) => ({
  ...(await real<typeof import("@/lib/core/catalogue/tcgdex-browse")>()),
  englishSets: (...a: unknown[]) => listSets(...a),
}));
/* The English shelf is read out of the copy (englishShelfSets); here it is the same listing. */
vi.mock("@/lib/core/catalogue/catalogue", () => ({
  englishShelfSets: (...a: unknown[]) => listSets(...a),
}));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const SET = {
  id: "base1",
  name: "Base",
  series: "Base",
  releaseDate: "1999/01/09",
  total: 102,
  printedTotal: 102,
  logo: null,
  symbol: null,
};

const row = (over: Record<string, unknown> = {}) => ({
  id: "row-1",
  name: "Charizard",
  number: "004",
  setName: "Base",
  rarity: null,
  gen: null,
  types: [],
  owned: true,
  excluded: false,
  acquiredAt: null,
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  ...over,
});

const sets = () => GET(new Request("https://cardorb.com/api/v1/catalog/sets"));

beforeEach(() => {
  authorise.mockResolvedValue(VIEWER);
  /* The route asks the open door now. It answers what authorise() would, so the
     tests that set a viewer or a refusal keep saying what they always said. */
  authoriseOpen.mockImplementation((...a: unknown[]) => authorise(...a));
  listSets.mockResolvedValue([SET]);
  getRows.mockResolvedValue({ rows: [], failed: false });
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/catalog/sets", () => {
  /* Bart, 2026-09-15: a client is sent only files in our bucket. */
  it("sends a wordmark or symbol only where it is a file of ours", async () => {
    listSets.mockResolvedValue([
      { ...SET, logo: "https://images.pokemontcg.io/base1/logo.png", symbol: null },
      {
        ...SET,
        id: "base2",
        name: "Jungle",
        logo: "https://images.cardorb.com/en/base/base2/logo.webp",
        symbol: "https://assets.tcgdex.net/en/base/base2/symbol.webp",
      },
    ]);
    const body = await (await sets()).json();
    expect(
      body.sets.map((s: { logo: string | null; symbol: string | null }) => [s.logo, s.symbol]),
    ).toEqual([
      [null, null],
      ["https://images.cardorb.com/en/base/base2/logo.webp", null],
    ]);
  });

  it("refuses when authorisation refuses, without asking the catalogue", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await sets();
    expect(res.status).toBe(401);
    expect(listSets).not.toHaveBeenCalled();
  });

  it("returns every set with the viewer's own counts attached", async () => {
    getRows.mockResolvedValue({ rows: [row(), row({ id: "b", owned: false })], failed: false });
    const res = await sets();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sets).toHaveLength(1);
    expect(body.sets[0]).toMatchObject({
      id: "base1",
      total: 102,
      ownedCount: 1,
      wishlistCount: 1,
    });
  });

  it("returns zero counts for a set nothing is filed under", async () => {
    getRows.mockResolvedValue({ rows: [row({ setName: "Jungle" })], failed: false });
    const { sets: out } = await (await sets()).json();
    expect(out[0]).toMatchObject({ ownedCount: 0, wishlistCount: 0 });
  });

  it("answers 502 with a sentence a client can show when the catalogue refused", async () => {
    listSets.mockRejectedValue(new Error("TCGdex en set index answered 503"));
    const res = await sets();
    expect(res.status).toBe(502);
    /* A sentence, not a slug: this used to be "catalog-unavailable", the one
       error under /v1 a client had to translate rather than display. */
    expect((await res.json()).error).toBe("The catalogue did not answer. Try again in a moment.");
    /* The shelf failed, so there was no reason to read the collection. */
    expect(getRows).not.toHaveBeenCalled();
  });

  it("still serves the shelf when the collection could not be read, and says so", async () => {
    getRows.mockResolvedValue({ rows: [], failed: true });
    const res = await sets();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sets[0]).toMatchObject({ ownedCount: 0 });
    /* Without this a client cannot tell "you own none of these" from "we could
       not find out", which are different sentences to put on a screen. */
    expect(body.collectionUnavailable).toBe(true);
  });

  it("says nothing about availability on the ordinary path", async () => {
    expect(await (await sets()).json()).not.toHaveProperty("collectionUnavailable");
  });
});

describe("without a credential", () => {
  beforeEach(() => authoriseOpen.mockResolvedValue(null));

  it("serves the shelf to a reader who offered nothing", async () => {
    const res = await sets();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sets).toHaveLength(1);
    expect(body.sets[0]).toMatchObject({ id: "base1", total: 102 });
  });

  /* Absent, not zero. "You own none of these" and "we did not ask" are
     different sentences, and a client can only tell them apart by the field
     being missing. */
  it("leaves the holdings off rather than answering zero", async () => {
    const { sets: out } = await (await sets()).json();
    expect(out[0]).not.toHaveProperty("ownedCount");
  });

  it("says nothing about a collection it never read", async () => {
    expect(await (await sets()).json()).not.toHaveProperty("failed");
  });

  it("does not read the collection at all", async () => {
    await sets();
    expect(getRows).not.toHaveBeenCalled();
  });
});

/**
 * A refusal is nobody's to hold.
 *
 * The open window is a shared cache's to keep, so a catalogue outage sent
 * with it would be stored once and handed to every signed-out visitor until
 * it expired. One TCGdex hiccup would read as the catalogue being empty for
 * everybody, long after it came back.
 */
describe("a failure is never cached, credential or not", () => {
  beforeEach(() => {
    authoriseOpen.mockResolvedValue(null);
  });

  it("sends a catalogue refusal with no-store even for a reader with no account", async () => {
    listSets.mockRejectedValue(new Error("TCGdex answered 503"));
    const res = await GET(new Request("https://api.test/api/v1/catalog/sets"));
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("sends a bad language with no-store too", async () => {
    const res = await GET(new Request("https://api.test/api/v1/catalog/sets?language=xx"));
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("still sends the shelf itself with the open window", async () => {
    listSets.mockResolvedValue([SET]);
    const res = await GET(new Request("https://api.test/api/v1/catalog/sets"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
  });
});

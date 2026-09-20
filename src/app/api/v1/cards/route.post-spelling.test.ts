import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A card added through POST /v1/cards is stored spelt as the catalogue copy spells it.
 *
 * The number used to be normalised in two places, the storage layer (storedCardNumber in
 * createRow) and a check constraint on the column, and migration 20260920160000 took both away at
 * once: what keeps a row right now is that this route calls withCatalogueSpelling() before
 * createRow(). The tests in storage/postgres.test.ts assert the layer writes what it is handed, so
 * nothing there fails if this call is moved or dropped. This is the test that does.
 *
 * Both halves of the rule, because only the pair says anything: a card the copy holds takes the
 * copy's spelling, and a card it does not keeps the old stored form.
 */

const authorise = vi.fn();
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  authoriseWrite: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
  storeErrorResponse: () => new Response(null, { status: 503 }),
}));
vi.mock("@/lib/api/viewer", () => ({ bearer: () => null }));
vi.mock("@/lib/core/collection/collection", () => ({
  getCardPrices: vi.fn(),
  getCollection: vi.fn(),
  findFolder: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/core/catalogue/default-finish", () => ({ defaultFinishFor: async () => "holo" }));

/* The id step ahead of the spelling one: the draft already carries the copy's id here, which is
   what catalogue-ids.test.ts covers. */
vi.mock("@/lib/core/collection/catalogue-ids", () => ({
  withCatalogueIds: async (rows: unknown[]) => rows,
}));

/** The copy, as catalogueCardSpellings reads it: one card it holds, and nothing else. */
const HELD: Record<string, { id: string; name: string; set_name: string; local_id: string }> = {
  "smp-SM168": {
    id: "smp-SM168",
    name: "Pikachu & Zekrom-GX",
    set_name: "SM Black Star Promos",
    local_id: "SM168",
  },
};
const asked: string[][] = [];
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => ({}) }));
vi.mock("@/lib/storage/postgres", () => ({
  printPicturesOfCards: vi.fn(),
  fullArtIdsAmong: vi.fn(),
  catalogueCardSpellings: async (_db: unknown, ids: string[]) => {
    asked.push(ids);
    return new Map(
      ids
        .filter((id) => HELD[id])
        .map((id) => [
          id,
          { name: HELD[id]!.name, setName: HELD[id]!.set_name, number: HELD[id]!.local_id },
        ]),
    );
  },
}));

/** Every draft that reached the storage layer, which is the whole point of this file. */
const written: Record<string, unknown>[] = [];
const createRow = vi.fn(async (draft: Record<string, unknown>) => {
  written.push(draft);
  return "new-row-id";
});
vi.mock("@/lib/storage/collection", () => ({
  createRow: (draft: Record<string, unknown>) => createRow(draft),
}));

const { POST } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("https://api.cardorb.com/api/v1/cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

/** Everything validateCardDraft insists on, with the card's three facts over the top. */
const draft = (over: Record<string, unknown>) => ({
  name: "Pikachu & Zekrom GX",
  number: "168",
  set: "Sun & Moon Promos",
  rarity: "Promo",
  types: [],
  collection: true,
  quantity: 1,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  asked.length = 0;
  written.length = 0;
  authorise.mockResolvedValue(VIEWER);
});

describe("POST /v1/cards spells the row as the catalogue does", () => {
  it("stores the card's printed number, name and set name for a card the copy holds", async () => {
    const res = await post(draft({ tcgId: "smp-SM168" }));
    expect(res.status).toBeLessThan(300);
    expect(asked).toEqual([["smp-SM168"]]);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      tcgId: "smp-SM168",
      // The three the copy decides, each different from what the client sent.
      number: "SM168",
      name: "Pikachu & Zekrom-GX",
      set: "SM Black Star Promos",
    });
  });

  /* No card to copy, so the old stored form stands: the promo's letters come off and the rest of
     the draft is written as it was sent. */
  it("falls back to the stored form for a set the copy has no card for", async () => {
    const res = await post(
      draft({ tcgId: null, number: "XY123", name: "Venusaur EX", set: "A set of my own" }),
    );
    expect(res.status).toBeLessThan(300);
    expect(written[0]).toMatchObject({
      number: "123",
      name: "Venusaur EX",
      set: "A set of my own",
    });
  });

  it("trims and keeps a gallery's letters, which are the card's and not its set's", async () => {
    await post(draft({ tcgId: null, number: " TG16 ", set: "Astral Radiance Trainer Gallery" }));
    expect(written[0]).toMatchObject({ number: "TG16" });
  });
});

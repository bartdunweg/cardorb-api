import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogueCardSheet } from "@/lib/storage/postgres";

/**
 * A page of cards' facts in one request, out of the copy alone: every id asked comes back, a card
 * the copy cannot answer in full is null so the client asks the single route, and a store that
 * does not answer is a 503 rather than a page of nulls.
 */
const authorise = vi.fn();
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({ "Cache-Control": "private, no-store" }),
}));
const catalogueCardSheets = vi.fn();
const printPicturesOfCards = vi.fn();
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => ({}) }));
vi.mock("@/lib/storage/postgres", () => ({
  catalogueCardSheets: (...a: unknown[]) => catalogueCardSheets(...a),
  printPicturesOfCards: (...a: unknown[]) => printPicturesOfCards(...a),
}));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(
    new Request("https://api.cardorb.com/v1/cards/facts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const sheet = (
  id: string,
  of: { serie?: string | null; languages?: string[] | null; variants?: unknown[] } = {},
): CatalogueCardSheet =>
  ({
    card: {
      id,
      set_id: id.split("-")[0],
      local_id: id.split("-")[1],
      name: "Machamp",
      set_name: "151",
      image: null,
      rarity: "Uncommon",
      types: ["Fighting"],
      illustrator: "Kagemaru Himeno",
      hp: 180,
      stage: "Stage2",
      evolve_from: "Machoke",
      regulation_mark: "G",
      first_edition: false,
      variants: of.variants ?? [{ type: "normal" }, { type: "reverse" }],
      languages: of.languages === undefined ? ["en", "de"] : of.languages,
      local_name: null,
    },
    set: {
      id: id.split("-")[0],
      name: "151",
      logo: null,
      total: 207,
      serie_id: of.serie === undefined ? "sv" : of.serie,
    },
  }) as unknown as CatalogueCardSheet;

beforeEach(() => {
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  catalogueCardSheets.mockResolvedValue(new Map());
  printPicturesOfCards.mockResolvedValue(new Map());
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/cards/facts", () => {
  it("refuses when authorisation refuses", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    expect((await post({ ids: ["sv03.5-068"] })).status).toBe(401);
    expect(catalogueCardSheets).not.toHaveBeenCalled();
  });

  it("refuses a body that names no ids, too many, or something that is not an id", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ ids: [] })).status).toBe(400);
    expect((await post({ ids: [42] })).status).toBe(400);
    expect((await post({ ids: Array.from({ length: 251 }, (_, i) => `sv1-${i}`) })).status).toBe(
      400,
    );
    expect((await post({ ids: ["sv1-1"], language: "de" })).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
    expect(catalogueCardSheets).not.toHaveBeenCalled();
  });

  it("answers each card's facts as the single route reads them, without prices", async () => {
    catalogueCardSheets.mockResolvedValue(new Map([["sv03.5-068", sheet("sv03.5-068")]]));
    const res = await post({ ids: ["sv03.5-068", "sv03.5-068"] });
    expect(res.status).toBe(200);
    expect(catalogueCardSheets).toHaveBeenCalledWith(expect.anything(), ["sv03.5-068"], "en");
    const { cards } = await res.json();
    expect(Object.keys(cards)).toEqual(["sv03.5-068"]);
    expect(cards["sv03.5-068"]).toMatchObject({
      id: "sv03.5-068",
      rarity: "Uncommon",
      illustrator: "Kagemaru Himeno",
      hp: 180,
      evolveFrom: "Machoke",
      regulationMark: "G",
      firstEdition: false,
      languages: ["en", "de"],
      foilPatterns: null,
    });
    expect(cards["sv03.5-068"].printings.length).toBeGreaterThan(0);
    // 151's Machamp: the collection box cosmos holo beside the plain card, as the single route's test.
    expect(cards["sv03.5-068"].patternPrints).toEqual({
      standard: true,
      prints: [{ foilPattern: "cosmos", finish: "holo", tcgplayerId: 662070, image: null }],
    });
    expect(cards["sv03.5-068"]).not.toHaveProperty("price");
  });

  it("gives each printing its own picture where the store holds one, in one read for the page", async () => {
    const cosmos = "https://images.cardorb.com/tcgplayer/662070.jpg";
    catalogueCardSheets.mockResolvedValue(new Map([["sv03.5-068", sheet("sv03.5-068")]]));
    printPicturesOfCards.mockResolvedValue(
      new Map([["sv03.5-068", new Map([["holo/cosmos", cosmos]])]]),
    );
    const { cards } = await (await post({ ids: ["sv03.5-068"] })).json();
    expect(printPicturesOfCards).toHaveBeenCalledTimes(1);
    expect(cards["sv03.5-068"].patternPrints.prints[0].image).toBe(cosmos);
    expect(cards["sv03.5-068"].printings.every((p: { image: unknown }) => p.image === null)).toBe(
      true,
    );
  });

  it("answers the facts without pictures when the pictures cannot be read", async () => {
    catalogueCardSheets.mockResolvedValue(new Map([["sv03.5-068", sheet("sv03.5-068")]]));
    printPicturesOfCards.mockRejectedValue(new Error("down"));
    const res = await post({ ids: ["sv03.5-068"] });
    expect(res.status).toBe(200);
    expect((await res.json()).cards["sv03.5-068"].printings.length).toBeGreaterThan(0);
  });

  it("answers a Wizards card's one foil as nothing to choose", async () => {
    catalogueCardSheets.mockResolvedValue(
      new Map([["base1-8", sheet("base1-8", { serie: "base" })]]),
    );
    const { cards } = await (await post({ ids: ["base1-8"] })).json();
    expect(cards["base1-8"].foilPatterns).toEqual([]);
  });

  /* Null is "ask the single route": it would ask TCGdex for these, and the batch asks nobody. */
  it("answers null for a card the copy lacks, or holds without its languages or its era", async () => {
    catalogueCardSheets.mockResolvedValue(
      new Map([
        ["sv1-1", sheet("sv1-1", { languages: null })],
        ["sv1-2", sheet("sv1-2", { serie: null })],
      ]),
    );
    const { cards } = await (await post({ ids: ["sv1-1", "sv1-2", "sv1-3"] })).json();
    expect(cards).toEqual({ "sv1-1": null, "sv1-2": null, "sv1-3": null });
  });

  it("answers a Japanese card with no Western languages, era or pattern prints", async () => {
    catalogueCardSheets.mockResolvedValue(
      new Map([["SV2a-068", sheet("SV2a-068", { languages: null, serie: null })]]),
    );
    const res = await post({ ids: ["SV2a-068"], language: "ja" });
    expect(catalogueCardSheets).toHaveBeenCalledWith(expect.anything(), ["SV2a-068"], "ja");
    const { cards } = await res.json();
    expect(cards["SV2a-068"]).toMatchObject({
      languages: [],
      foilPatterns: null,
      patternPrints: null,
    });
  });

  it("answers 503 when the copy does not answer, not a page of nulls", async () => {
    catalogueCardSheets.mockRejectedValue(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post({ ids: ["sv1-1"] })).status).toBe(503);
  });
});

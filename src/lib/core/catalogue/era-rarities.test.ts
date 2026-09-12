import { afterEach, describe, expect, it, vi } from "vitest";
import { eraRaritiesOfSet, loadEraRarities } from "./era-rarities";
import { resetBreaker } from "./tcgdex-client";

afterEach(() => {
  vi.unstubAllGlobals();
  resetBreaker();
});

/** TCGdex: the REST set detail, then the two GraphQL calls the era walk makes. */
const catalogue = ({
  serie = "sv",
  sets = ["svp", "sv01"],
  rarities = { svp: ["Promo", "None"], sv01: ["Common", "Illustration rare", "Common"] },
}: {
  serie?: string | null;
  sets?: string[];
  rarities?: Record<string, string[]>;
} = {}) =>
  vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
    if (url.includes("/graphql")) {
      const query = String(init?.body ?? "");
      if (query.includes("serie(id:"))
        return Response.json({ data: { serie: { sets: sets.map((id) => ({ id })) } } });
      const data: Record<string, { rarity: string }[]> = {};
      sets.forEach((id, i) => {
        data[`s${i}`] = (rarities[id] ?? []).map((rarity) => ({ rarity }));
      });
      return Response.json({ data });
    }
    return Response.json(serie ? { id: "svp", serie: { id: serie } } : { id: "svp" });
  });

describe("loadEraRarities", () => {
  it("is every rarity the era's sets carry, once each, A to Z", async () => {
    catalogue({ rarities: { svp: ["Rare"], sv01: ["Illustration rare", "Common", "Common"] } });
    expect(await loadEraRarities("sv")).toEqual(["Common", "Illustration rare", "Rare"]);
  });

  it("leaves out what a catalogue writes where it has no rarity", async () => {
    catalogue({ rarities: { svp: ["Promo", "None", ""], sv01: ["Common"] } });
    expect(await loadEraRarities("sv")).toEqual(["Common"]);
  });

  it("asks for one set's cards per field, by the set id and its dash", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
      if (!url.includes("/graphql")) return Response.json({ id: "svp", serie: { id: "sv" } });
      bodies.push(String(init?.body ?? ""));
      if (bodies.at(-1)?.includes("serie(id:"))
        return Response.json({ data: { serie: { sets: [{ id: "sv03" }] } } });
      return Response.json({ data: { s0: [{ rarity: "Common" }] } });
    });
    await loadEraRarities("sv");
    expect(bodies.at(-1)).toContain('id: \\"sv03-\\"');
  });
});

describe("eraRaritiesOfSet", () => {
  it("reads the set's era and answers that era's rarities", async () => {
    catalogue();
    expect(await eraRaritiesOfSet("svp", loadEraRarities)).toEqual(["Common", "Illustration rare"]);
  });

  it("says nothing where the set names no era", async () => {
    catalogue({ serie: null });
    expect(await eraRaritiesOfSet("svp", loadEraRarities)).toBeNull();
  });

  it("says nothing where the era walk fails, rather than an empty list", async () => {
    catalogue();
    const failing = async () => {
      throw new Error("TCGdex answered 503");
    };
    expect(await eraRaritiesOfSet("svp", failing)).toBeNull();
  });
});

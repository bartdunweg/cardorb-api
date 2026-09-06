import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogueMatch } from "./ptcg-search";
import type { CatalogueSet } from "./ptcg-browse";

const setCatalogue = vi.fn();

/* catalogue.ts is the expensive half of the app and reaches two hosts; the
   swap's own logic is what these tests are about, so it is replaced with the
   shape it returns. Same boundary collection.test.ts mocks at. */
vi.mock("./catalogue", () => ({ setCatalogue: (...a: unknown[]) => setCatalogue(...a) }));

const { withTcgdexScans } = await import("./browse-artwork");

const PNG = "https://images.pokemontcg.io/sv3pt5/6.png";
const PNG_BIG = "https://images.pokemontcg.io/sv3pt5/6_hires.png";
const BASE = "https://assets.tcgdex.net/en/sv/sv03.5";

const set = (over: Partial<CatalogueSet> = {}): CatalogueSet => ({
  id: "sv3pt5",
  name: "151",
  series: "Scarlet & Violet",
  releaseDate: "2023/09/22",
  total: 207,
  printedTotal: 165,
  logo: null,
  symbol: null,
  localName: null,
  ...over,
});

const card = (over: Partial<CatalogueMatch> = {}): CatalogueMatch => ({
  id: "sv3pt5-6",
  number: "6",
  name: "Charizard",
  setName: "151",
  image: PNG,
  imageHigh: PNG_BIG,
  rarity: null,
  types: [],
  series: "Scarlet & Violet",
  ...over,
});

const catalogue = (over: Record<string, unknown> = {}) => ({
  byNumber: { "6": { id: "sv03.5-006", localId: "006", name: "Charizard", image: null } },
  assetBase: BASE,
  officialName: "151",
  code: "MEW",
  setHasScans: true,
  logo: null,
  releaseDate: "2023-09-22",
  total: 207,
  prices: {},
  ...over,
});

/* Braces, not a bare arrow. `mockResolvedValue` returns the mock itself, and a
   beforeEach that returns a function has handed vitest a teardown callback — so
   the concise form ends up *calling* setCatalogue() with no arguments after
   every test, which shows up as a phantom call and an unhandled rejection. */
beforeEach(() => {
  setCatalogue.mockResolvedValue(catalogue());
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("withTcgdexScans", () => {
  it("swaps in the low/high pair built from the set's asset base", async () => {
    const [out] = await withTcgdexScans(set(), [card()]);
    expect(out).toMatchObject({
      image: `${BASE}/006/low.webp`,
      imageHigh: `${BASE}/006/high.webp`,
    });
  });

  it("leaves everything else about the card alone", async () => {
    const [out] = await withTcgdexScans(set(), [card({ rarity: "Rare Holo", types: ["Fire"] })]);
    expect(out).toMatchObject({
      id: "sv3pt5-6",
      number: "6",
      name: "Charizard",
      rarity: "Rare Holo",
      types: ["Fire"],
    });
  });

  it("prefers the card's own image path when TCGdex gives one", async () => {
    setCatalogue.mockResolvedValue(
      catalogue({
        byNumber: { "6": { id: "x", localId: "006", name: "Charizard", image: `${BASE}/006` } },
      }),
    );
    const [out] = await withTcgdexScans(set(), [card()]);
    expect(out!.image).toBe(`${BASE}/006/low.webp`);
  });

  it("matches a padded catalogue number against an unpadded one", async () => {
    setCatalogue.mockResolvedValue(
      catalogue({
        byNumber: { "006": { id: "x", localId: "006", name: "Charizard", image: null } },
      }),
    );
    expect((await withTcgdexScans(set(), [card()]))[0]!.image).toBe(`${BASE}/006/low.webp`);
  });

  it("keeps the PNG for a card TCGdex does not have", async () => {
    setCatalogue.mockResolvedValue(catalogue({ byNumber: {} }));
    expect((await withTcgdexScans(set(), [card()]))[0]).toMatchObject({
      image: PNG,
      imageHigh: PNG_BIG,
    });
  });

  it("keeps the PNG when the number lines up on a card by another name", async () => {
    setCatalogue.mockResolvedValue(
      catalogue({
        byNumber: { "6": { id: "x", localId: "006", name: "Blastoise", image: null } },
      }),
    );
    expect((await withTcgdexScans(set(), [card()]))[0]!.image).toBe(PNG);
  });

  it("keeps the PNG for a set TCGdex has recorded but not photographed", async () => {
    setCatalogue.mockResolvedValue(catalogue({ setHasScans: false }));
    expect((await withTcgdexScans(set(), [card()]))[0]!.image).toBe(PNG);
  });

  it("keeps the PNG when there is no asset base and no image path", async () => {
    setCatalogue.mockResolvedValue(catalogue({ assetBase: null }));
    expect((await withTcgdexScans(set(), [card()]))[0]!.image).toBe(PNG);
  });

  it("fails soft when TCGdex cannot be reached at all", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    /* mockImplementation rather than mockRejectedValue: the latter builds its
       rejected promise the moment it is set, which Node flags as unhandled
       before the call under test ever awaits it. */
    setCatalogue.mockImplementation(async () => {
      throw new Error("sets index unavailable");
    });
    /* A second catalogue being down means heavier pictures, not a broken page —
       unlike the first, which 502s the route. */
    expect((await withTcgdexScans(set(), [card()]))[0]!.image).toBe(PNG);
  });

  it("asks about the parent set for a gallery, not the gallery itself", async () => {
    setCatalogue.mockResolvedValue(
      catalogue({
        byNumber: { tg12: { id: "x", localId: "TG12", name: "Zeraora", image: null } },
        assetBase: "https://assets.tcgdex.net/en/swsh/swsh12.5",
      }),
    );
    const tg = card({
      id: "swsh12tg-TG12",
      number: "TG12",
      name: "Zeraora",
      setName: "Silver Tempest Trainer Gallery",
    });
    const [out] = await withTcgdexScans(set({ name: "Silver Tempest Trainer Gallery" }), [tg]);

    /* The parent, because TCGdex lists a gallery's cards with no image of their
       own and files the files under the parent's path. */
    expect(setCatalogue).toHaveBeenCalledWith("Silver Tempest");
    expect(out!.image).toBe("https://assets.tcgdex.net/en/swsh/swsh12.5/TG12/low.webp");
  });

  it("asks under the name TCGdex uses where the two disagree", async () => {
    await withTcgdexScans(set({ name: "Scarlet & Violet Black Star Promos" }), [card()]);
    expect(setCatalogue).toHaveBeenCalledWith("SVP Black Star Promos");
  });

  it("does not ask at all for an empty set", async () => {
    expect(await withTcgdexScans(set(), [])).toEqual([]);
    expect(setCatalogue).not.toHaveBeenCalled();
  });
});

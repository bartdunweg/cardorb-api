import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogueNotFound } from "../catalogue/tcgdex-client";

/**
 * getCardDetail() used to catch everything and answer null, so both card
 * routes turned a TCGdex outage into "No such card." — a 404 a client would
 * cache and a person would read as the card being gone. Only a genuine miss
 * is null now; anything else is rethrown for the route to answer 503.
 */
const json = vi.fn();
vi.mock("../catalogue/catalogue", () => ({ json: (...a: unknown[]) => json(...a) }));

const { getCardDetail } = await import("./cards");

afterEach(() => {
  json.mockReset();
});

describe("getCardDetail", () => {
  it("is null for a card the catalogue does not have", async () => {
    json.mockRejectedValue(new CatalogueNotFound("card xx-1"));
    expect(await getCardDetail("xx-1")).toBeNull();
  });

  it("rethrows an outage rather than pretending the card is gone", async () => {
    json.mockRejectedValue(new Error("503"));
    await expect(getCardDetail("sv03-125")).rejects.toThrow("503");
  });

  it("is null for an answer with no card in it", async () => {
    json.mockResolvedValue({});
    expect(await getCardDetail("sv03-125")).toBeNull();
  });

  /* The live read answered TCGdex's own words until 2026-09-14, where every other English read went
     through card-fact-corrections.ts. */
  it("answers an English card through the same corrections as the copy", async () => {
    json.mockResolvedValue({
      id: "dp5-121",
      name: "Infernape LV.X",
      rarity: "Rare Holo LV.X",
      types: ["Fire"],
      stage: "LEVEL-UP",
      evolveFrom: null,
    });
    const card = await getCardDetail("dp5-121");
    expect(card?.evolveFrom).toBe("Infernape");
    expect(card?.rarity).toBe("Holo Rare LV.X");

    json.mockResolvedValue({ id: "ex13-103", name: "Mewtwo Star", rarity: "Rare", types: [] });
    expect((await getCardDetail("ex13-103"))?.name).toBe("Mewtwo ☆");

    json.mockResolvedValue({ id: "swsh12.5gg-GG01", name: "Hisuian Voltorb", rarity: "Rare" });
    expect((await getCardDetail("swsh12.5gg-GG01"))?.rarity).toBe("Galarian Gallery");
  });

  /* Bart, 2026-09-15: a client is sent only files in our bucket. A card read live is one the
     nightly copy has not been through, so TCGdex's addresses are all there is: no picture. */
  it("names no picture and no wordmark for a card read live, and asks no picture host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    json.mockResolvedValue({
      id: "sv03.5-006",
      name: "Charizard ex",
      image: "https://assets.tcgdex.net/en/sv/sv03.5/006",
      set: { id: "sv03.5", name: "151", logo: "https://assets.tcgdex.net/en/sv/sv03.5/logo" },
    });
    const card = await getCardDetail("sv03.5-006");
    expect(card?.image).toBeNull();
    expect(card?.set).toMatchObject({ id: "sv03.5", logo: null });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

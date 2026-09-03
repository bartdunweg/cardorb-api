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
});

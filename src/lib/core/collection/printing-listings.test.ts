import { describe, expect, it, vi } from "vitest";

vi.mock("./collection", () => ({}));
vi.mock("../catalogue/card-printings", () => ({}));

const { listingsFrom } = await import("./printing-listings");

/* cardorb-api#561: a printing listed and never sold is shown at its lowest listing, labelled. */
describe("listingsFrom", () => {
  const listing = (n: number) => ({
    market: null,
    lowestListing: n,
    basis: "lowest-listing" as const,
  });
  const market = (n: number) => ({ market: n, basis: "market" as const });

  it("keeps the listing-only printings under the history's keys, and never one with a market figure", () => {
    expect(
      listingsFrom({
        holofoil: market(12),
        "reverse-holofoil": listing(40.5),
        "1st-edition-holofoil": null,
      }),
    ).toEqual({ "reverse-holofoil": 40.5 });
  });

  it("keys a pattern print as its line is keyed", () => {
    expect(
      listingsFrom(undefined, [
        { foilPattern: "cosmos", finish: "holo", price: listing(3.2) },
        { foilPattern: "cracked-ice", finish: "reverse-holo", price: market(4) },
        { foilPattern: "cracked-ice", finish: "normal", price: null },
      ] as never),
    ).toEqual({ "cosmos-holofoil": 3.2 });
  });
});

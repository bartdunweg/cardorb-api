import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogueNotFound, json } from "./tcgdex-client";

/**
 * A 404 from TCGdex is an answer, not an outage.
 *
 * json() retries because a busy build gets some requests refused, and a
 * refusal that is retried once more usually succeeds. A 404 is not that: the
 * card is not there, and asking twice more only costs two round trips before
 * the same answer. It is also the one failure a caller needs to tell apart —
 * "no such card" is a 404 for the client, everything else is a 503 — so it
 * arrives as its own class.
 */
describe("json", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("does not retry a 404, and names it", async () => {
    const fetch = vi.fn(async () => new Response("not found", { status: 404 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

    await expect(
      json("https://api.tcgdex.net/v2/en/cards/xx-1", "card xx-1"),
    ).rejects.toBeInstanceOf(CatalogueNotFound);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("still retries any other failure", async () => {
    const fetch = vi.fn(async () => new Response("busy", { status: 503 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

    const failed = await json("https://api.tcgdex.net/v2/en/sets", "sets").catch((e) => e);
    expect(failed).toBeInstanceOf(Error);
    expect(failed).not.toBeInstanceOf(CatalogueNotFound);
    expect(fetch).toHaveBeenCalledTimes(3);
  }, 10_000);
});

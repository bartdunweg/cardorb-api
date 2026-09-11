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

/**
 * During an outage every request used to wait on three attempts — up to three
 * timeouts and two pauses — before the rows came back without the catalogue
 * (cardorb-api#164). The breaker makes the second request, and every one for
 * twenty seconds after, fail at once; then one is let through to find out.
 */
describe("the breaker", () => {
  const realFetch = globalThis.fetch;
  let now = 1_000_000;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  const load = async () => {
    vi.resetModules();
    return import("./tcgdex-client");
  };
  const down = () => {
    const fetch = vi.fn(async () => new Response("busy", { status: 503 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    return fetch;
  };

  it("refuses every call for twenty seconds after one failed, without asking", async () => {
    const { json, CatalogueDown } = await load();
    const fetch = down();
    await json("https://api.tcgdex.net/v2/en/sets", "sets").catch(() => null);
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(json("https://api.tcgdex.net/v2/en/cards/sv1-1", "card")).rejects.toBeInstanceOf(
      CatalogueDown,
    );
    now += 19_000;
    await expect(json("https://api.tcgdex.net/v2/en/cards/sv1-2", "card")).rejects.toBeInstanceOf(
      CatalogueDown,
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  }, 10_000);

  it("asks again once the window has passed, and stays open on an answer", async () => {
    const { json } = await load();
    const fetch = down();
    await json("https://api.tcgdex.net/v2/en/sets", "sets").catch(() => null);
    now += 21_000;
    fetch.mockImplementation(async () => Response.json({ ok: true }));
    await expect(json("https://api.tcgdex.net/v2/en/sets", "sets")).resolves.toEqual({ ok: true });
    await expect(json("https://api.tcgdex.net/v2/en/cards/sv1-1", "card")).resolves.toEqual({
      ok: true,
    });
    expect(fetch).toHaveBeenCalledTimes(5);
  }, 10_000);

  it("is not tripped by a 404: that is an answer", async () => {
    const { json, CatalogueNotFound } = await load();
    const fetch = vi.fn(async () => new Response("not found", { status: 404 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    await expect(json("https://api.tcgdex.net/v2/en/cards/xx-1", "card")).rejects.toBeInstanceOf(
      CatalogueNotFound,
    );
    await expect(json("https://api.tcgdex.net/v2/en/cards/xx-2", "card")).rejects.toBeInstanceOf(
      CatalogueNotFound,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("holds GraphQL to the same window", async () => {
    const { json, graphql, CatalogueDown } = await load();
    const fetch = down();
    await json("https://api.tcgdex.net/v2/en/sets", "sets").catch(() => null);
    await expect(graphql("{ sets { id } }", "set index")).rejects.toBeInstanceOf(CatalogueDown);
    expect(fetch).toHaveBeenCalledTimes(3);
  }, 10_000);
});

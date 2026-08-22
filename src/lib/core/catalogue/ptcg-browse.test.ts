import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let calls: { url: string; headers?: Record<string, string> }[] = [];

/** Answers each request with the next body in the list, repeating the last. */
function installFetch(responses: { status?: number; body?: unknown }[]) {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url: String(input), headers: init?.headers });
      const next = responses[Math.min(i++, responses.length - 1)]!;
      return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 });
    }),
  );
}

/* Reset between tests because listSets() is behind Next's fetch cache in
   production and behind nothing here — a stale module would otherwise carry a
   previous test's stub. Same pattern as ptcg-search.test.ts. */
const load = async () => {
  vi.resetModules();
  return import("./ptcg-browse");
};

const SET = {
  id: "sv3pt5",
  name: "151",
  series: "Scarlet & Violet",
  releaseDate: "2023/09/22",
  total: 207,
  printedTotal: 165,
  images: { logo: "https://img/logo.png", symbol: "https://img/symbol.png" },
};

const OLDER = { ...SET, id: "base1", name: "Base", series: "Base", releaseDate: "1999/01/09" };

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.POKEMONTCG_API_KEY;
  vi.restoreAllMocks();
});

describe("listSets", () => {
  it("maps a set into the shape a tile needs", async () => {
    installFetch([{ body: { data: [SET], totalCount: 1 } }]);
    const { listSets } = await load();

    expect(await listSets()).toEqual([
      {
        id: "sv3pt5",
        name: "151",
        series: "Scarlet & Violet",
        releaseDate: "2023/09/22",
        total: 207,
        printedTotal: 165,
        logo: "https://img/logo.png",
        symbol: "https://img/symbol.png",
      },
    ]);
  });

  it("asks for one page big enough to hold the whole catalogue", async () => {
    installFetch([{ body: { data: [SET] } }]);
    const { listSets } = await load();
    await listSets();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/v2/sets?");
    expect(calls[0]!.url).toContain("pageSize=250");
  });

  it("sorts newest first, whatever order they arrive in", async () => {
    installFetch([{ body: { data: [OLDER, SET] } }]);
    const { listSets } = await load();

    expect((await listSets()).map((s) => s.id)).toEqual(["sv3pt5", "base1"]);
  });

  it("drops a set with no name rather than rendering a blank tile", async () => {
    installFetch([{ body: { data: [{ id: "ghost" }, SET] } }]);
    const { listSets } = await load();

    expect((await listSets()).map((s) => s.id)).toEqual(["sv3pt5"]);
  });

  it("sends the API key when there is one", async () => {
    process.env.POKEMONTCG_API_KEY = "k";
    installFetch([{ body: { data: [SET] } }]);
    const { listSets } = await load();
    await listSets();

    expect(calls[0]!.headers).toMatchObject({ "X-Api-Key": "k" });
  });

  it("retries and then throws, rather than answering with an empty shelf", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    installFetch([{ status: 502 }]);
    const { listSets } = await load();

    await expect(listSets()).rejects.toThrow("unavailable");
    expect(calls).toHaveLength(3);
  });

  it("recovers when a retry succeeds", async () => {
    installFetch([{ status: 500 }, { body: { data: [SET] } }]);
    const { listSets } = await load();

    expect(await listSets()).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });
});

describe("findSet", () => {
  it("answers null for an id nobody carries, rather than guessing", async () => {
    installFetch([{ body: { data: [SET] } }]);
    const { findSet } = await load();

    expect(await findSet("sv3pt5")).toMatchObject({ name: "151" });
    expect(await findSet("nope")).toBeNull();
  });
});

const card = (number: string, name = "Bulbasaur") => ({
  id: `sv3pt5-${number}`,
  number,
  name,
  rarity: "Common",
  types: ["Grass"],
  set: { name: "151", series: "Scarlet & Violet" },
  images: { small: "https://img/s.png", large: "https://img/l.png" },
});

describe("setCards", () => {
  it("queries by set id and maps into the same shape a search result has", async () => {
    installFetch([{ body: { data: [card("1")], totalCount: 1 } }]);
    const { setCards } = await load();

    expect(await setCards("sv3pt5")).toEqual([
      {
        id: "sv3pt5-1",
        number: "1",
        name: "Bulbasaur",
        setName: "151",
        series: "Scarlet & Violet",
        image: "https://img/s.png",
        imageHigh: "https://img/l.png",
        rarity: "Common",
        types: ["Grass"],
      },
    ]);
    expect(calls[0]!.url).toContain(`q=${encodeURIComponent("set.id:sv3pt5")}`);
    expect(calls[0]!.url).toContain("pageSize=250");
  });

  it("orders by the number's value, not its spelling", async () => {
    installFetch([
      { body: { data: [card("100"), card("2"), card("010"), card("20")], totalCount: 4 } },
    ]);
    const { setCards } = await load();

    expect((await setCards("sv3pt5")).map((c) => c.number)).toEqual(["2", "010", "20", "100"]);
  });

  it("puts a lettered run after the main one, in its own order", async () => {
    installFetch([
      { body: { data: [card("TG02"), card("5"), card("TG01"), card("SVP001")], totalCount: 4 } },
    ]);
    const { setCards } = await load();

    expect((await setCards("sv3pt5")).map((c) => c.number)).toEqual([
      "5",
      "SVP001",
      "TG01",
      "TG02",
    ]);
  });

  it("pages until the total is reached", async () => {
    installFetch([
      {
        body: { data: Array.from({ length: 250 }, (_, i) => card(String(i + 1))), totalCount: 300 },
      },
      {
        body: {
          data: Array.from({ length: 50 }, (_, i) => card(String(i + 251))),
          totalCount: 300,
        },
      },
    ]);
    const { setCards } = await load();

    expect(await setCards("sv3pt5")).toHaveLength(300);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toContain("page=2");
  });

  it("stops at the page cap rather than looping on a host that repeats itself", async () => {
    installFetch([{ body: { data: [card("1")], totalCount: 10_000 } }]);
    const { setCards } = await load();

    await setCards("sv3pt5");
    expect(calls).toHaveLength(4);
  });

  it("answers an empty set with an empty list and one request", async () => {
    installFetch([{ body: { data: [], totalCount: 0 } }]);
    const { setCards } = await load();

    expect(await setCards("sv3pt5")).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("throws rather than answering an empty set when the host refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    installFetch([{ status: 500 }]);
    const { setCards } = await load();

    await expect(setCards("sv3pt5")).rejects.toThrow("unavailable");
  });

  it("escapes an id so it cannot change what the query means", async () => {
    installFetch([{ body: { data: [], totalCount: 0 } }]);
    const { setCards } = await load();
    await setCards('sv3pt5" OR name:*');

    /* The colon and the star are escaped too, so the injected clause is one
       literal term rather than a second field query. */
    expect(decodeURIComponent(calls[0]!.url)).toContain('set.id:sv3pt5\\" OR name\\:\\*');
  });
});

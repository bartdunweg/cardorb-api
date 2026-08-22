import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let calls: { url: string; headers?: Record<string, string> }[] = [];

function installFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url: String(input), headers: init?.headers });
      return new Response(JSON.stringify(body), { status });
    }),
  );
}

const load = async () => {
  vi.resetModules();
  return import("./ptcg-search");
};

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.POKEMONTCG_API_KEY;
});

describe("searchCards", () => {
  it("maps a card into the shape the add-card form uses", async () => {
    installFetch(200, {
      data: [
        {
          id: "base1-4",
          number: "4",
          name: "Charizard",
          rarity: "Rare Holo",
          types: ["Fire"],
          set: { name: "Base", series: "Base" },
          images: { small: "https://img/small", large: "https://img/large" },
        },
      ],
    });
    const { searchCards } = await load();

    expect(await searchCards("char")).toEqual([
      {
        id: "base1-4",
        number: "4",
        name: "Charizard",
        setName: "Base",
        series: "Base",
        image: "https://img/small",
        imageHigh: "https://img/large",
        rarity: "Rare Holo",
        types: ["Fire"],
      },
    ]);
  });

  it("builds one query across name, number, set name and type", async () => {
    installFetch(200, { data: [] });
    const { searchCards } = await load();

    await searchCards("char");
    const q = new URL(calls[0]!.url).searchParams.get("q");
    expect(q).toBe("(name:*char* OR number:char* OR set.name:*char* OR types:Char*)");
  });

  it("joins multiple words as separate AND'd clauses, not one phrase", async () => {
    installFetch(200, { data: [] });
    const { searchCards } = await load();

    await searchCards("charizard 151");
    const q = new URL(calls[0]!.url).searchParams.get("q");
    expect(q).toBe(
      "(name:*charizard* OR number:charizard* OR set.name:*charizard* OR types:Charizard*)" +
        " (name:*151* OR number:151* OR set.name:*151* OR types:151*)",
    );
  });

  it("caps the number of words a query can grow to", async () => {
    installFetch(200, { data: [] });
    const { searchCards } = await load();

    await searchCards("a b c d e f g h");
    const q = new URL(calls[0]!.url).searchParams.get("q");
    expect(q?.split(") (")).toHaveLength(6);
  });

  it("escapes Lucene special characters in the typed term", async () => {
    installFetch(200, { data: [] });
    const { searchCards } = await load();

    await searchCards('a"b');
    const q = new URL(calls[0]!.url).searchParams.get("q");
    expect(q).toContain('a\\"b');
  });

  it("skips a result missing a number or a name", async () => {
    installFetch(200, {
      data: [
        { id: "no-number", name: "Charizard", set: {}, images: {} },
        { id: "no-name", number: "4", set: {}, images: {} },
      ],
    });
    const { searchCards } = await load();

    expect(await searchCards("char")).toEqual([]);
  });

  it("sends the API key header when POKEMONTCG_API_KEY is set", async () => {
    process.env.POKEMONTCG_API_KEY = "secret";
    installFetch(200, { data: [] });
    const { searchCards } = await load();

    await searchCards("char");
    expect(calls[0]!.headers).toMatchObject({ "X-Api-Key": "secret" });
  });

  it("sends no API key header when it is unset", async () => {
    installFetch(200, { data: [] });
    const { searchCards } = await load();

    await searchCards("char");
    expect(calls[0]!.headers ?? {}).not.toHaveProperty("X-Api-Key");
  });

  it("retries three times total, then throws rather than returning empty", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    installFetch(502, "nope");
    const { searchCards } = await load();

    await expect(searchCards("char")).rejects.toThrow();
    expect(calls).toHaveLength(3);
  });

  it("targets each filter field precisely, AND'd together", async () => {
    installFetch(200, { data: [] });
    const { searchCards } = await load();

    await searchCards({ name: "charizard", set: "151" });
    const q = new URL(calls[0]!.url).searchParams.get("q");
    expect(q).toBe("name:*charizard* set.name:*151*");
  });

  it("only includes filter fields that were actually filled in", async () => {
    installFetch(200, { data: [] });
    const { searchCards } = await load();

    await searchCards({ name: "", number: "6", set: "", type: "" });
    const q = new URL(calls[0]!.url).searchParams.get("q");
    expect(q).toBe("number:6*");
  });

  it("targets number as a prefix and type title-cased, not wildcarded both sides", async () => {
    installFetch(200, { data: [] });
    const { searchCards } = await load();

    await searchCards({ number: "6", type: "fire" });
    const q = new URL(calls[0]!.url).searchParams.get("q");
    expect(q).toBe("number:6* types:Fire*");
  });

  it("returns no results and makes no request for empty filters", async () => {
    installFetch(200, { data: [] });
    const { searchCards } = await load();

    expect(await searchCards({})).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("defaults to page 1 and forwards an explicit page number", async () => {
    installFetch(200, { data: [] });
    const { searchCards } = await load();

    await searchCards("char");
    expect(new URL(calls[0]!.url).searchParams.get("page")).toBe("1");

    await searchCards("char", 3);
    expect(new URL(calls[1]!.url).searchParams.get("page")).toBe("3");
  });

  it("succeeds on a retry after one failure", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n += 1;
        if (n === 1) return new Response("nope", { status: 502 });
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }),
    );
    const { searchCards } = await load();

    expect(await searchCards("char")).toEqual([]);
    expect(n).toBe(2);
  });
});

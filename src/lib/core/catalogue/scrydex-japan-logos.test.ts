import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseExpansionCards,
  parseExpansions,
  scrydexCodeByName,
  scrydexLogoFor,
  scrydexNumbers,
  scrydexRealLogo,
} from "./scrydex-japan-logos";

const page = `
  <a data-name="Pokémon Card 151" class="x" href="/pokemon/expansions/pokmon-card-151/sv2a_ja">
  <a data-name="Shiny Star V" class="x" href="/pokemon/expansions/shiny-star-v/swsh4a_ja">
  <a data-name="Peerless Fighters" class="x" href="/pokemon/expansions/peerless-fighters/swsh5a_ja">
  <a data-name="Leaders&#39; Stadium" class="x" href="/pokemon/expansions/leaders-stadium/gym1_ja">
  <a data-name="Shiny Star V" class="x" href="/pokemon/expansions/shiny-star-v/swsh4a_ja">
`;

describe("parseExpansions", () => {
  it("reads each expansion once, its name unescaped", () => {
    expect(parseExpansions(page)).toEqual([
      { name: "Pokémon Card 151", code: "sv2a_ja", slug: "pokmon-card-151" },
      { name: "Shiny Star V", code: "swsh4a_ja", slug: "shiny-star-v" },
      { name: "Peerless Fighters", code: "swsh5a_ja", slug: "peerless-fighters" },
      { name: "Leaders' Stadium", code: "gym1_ja", slug: "leaders-stadium" },
    ]);
  });
});

describe("scrydexLogoFor", () => {
  const expansions = parseExpansions(page);
  const logo = (code: string) => `https://images.scrydex.com/pokemon/${code}-logo/logo`;

  it("finds a set by its id", () => {
    expect(scrydexLogoFor(expansions, { id: "SV2a", name: "Pokémon Card 151" })).toBe(
      logo("sv2a_ja"),
    );
  });

  it("finds a set Scrydex codes its own way by its English title", () => {
    expect(scrydexLogoFor(expansions, { id: "S4a", name: "Shiny Star V" })).toBe(logo("swsh4a_ja"));
    expect(scrydexLogoFor(expansions, { id: "PMCG5", name: "Leaders' Stadium" })).toBe(
      logo("gym1_ja"),
    );
  });

  it("uses the hand-read code where Scrydex titles a set differently", () => {
    expect(scrydexLogoFor(expansions, { id: "S5a", name: "Matchless Fighters" })).toBe(
      logo("swsh5a_ja"),
    );
  });

  it("is null for a set Scrydex does not list", () => {
    expect(
      scrydexLogoFor(expansions, { id: "SVLN", name: "Starter Set Tera Type: Stellar Sylveon ex" }),
    ).toBeNull();
  });
});

describe("parseExpansionCards", () => {
  it("reads each numbered card once, its name folded", () => {
    const page = `
      <a href="/pokemon/cards/brocks-zubat/gym1_ja-1?variant=holo">
      <a href="/pokemon/cards/brocks-zubat/gym1_ja-1">
      <a href="/pokemon/cards/erikas-oddish/gym1_ja-2">
      <a href="/pokemon/cards/other/gym2_ja-3">`;
    expect(parseExpansionCards(page, "gym1_ja")).toEqual([
      { number: "1", name: "brockszubat" },
      { number: "2", name: "erikasoddish" },
    ]);
  });
});

describe("scrydexNumbers", () => {
  const scrydex = (...names: string[]) => names.map((name, i) => ({ number: String(i + 1), name }));

  it("takes a number where Scrydex's name contains the copy's", () => {
    const got = scrydexNumbers(scrydex("brockszubat", "erikasoddish"), [
      { id: "PMCG5-001", number: "001", name: "Zubat" },
      { id: "PMCG5-002", number: "002", name: "Oddish Oddish" },
    ]);
    expect([...got]).toEqual([
      ["PMCG5-001", "1"],
      ["PMCG5-002", "2"],
    ]);
  });

  it("finds a card by its name where Scrydex numbers the set its own way", () => {
    const got = scrydexNumbers(scrydex("oddish", "chikorita", "bayleef"), [
      { id: "neo1-009", number: "009", name: "Bayleef Bayleef" },
    ]);
    expect(got.get("neo1-009")).toBe("3");
  });

  it("takes an unnamed card by number only where the set's numbering agrees", () => {
    const named = ["a", "b", "c", "d", "e"].map((n, i) => ({
      id: `X-${i + 1}`,
      number: String(i + 1),
      name: n.repeat(4),
    }));
    const unnamed = { id: "X-6", number: "6", name: "リザードン" };
    const agreeing = scrydexNumbers(scrydex("aaaa", "bbbb", "cccc", "dddd", "eeee", "charizard"), [
      ...named,
      unnamed,
    ]);
    expect(agreeing.get("X-6")).toBe("6");
    const disagreeing = scrydexNumbers(scrydex("zz", "yy", "xx", "ww", "vv", "charizard"), [
      ...named,
      unnamed,
    ]);
    expect(disagreeing.get("X-6")).toBeUndefined();
  });
});

describe("scrydexRealLogo", () => {
  it("refuses Scrydex's generic wordmark, answered for a set it has no logo for", async () => {
    vi.stubGlobal(
      "fetch",
      async (url: string) =>
        new Response(null, {
          status: 200,
          headers: {
            etag: url.includes("pcg1_ja")
              ? '"cf-lVkzmA0aekAMPnwN5JhK5nygITfWme2fetQNLVvDQ"'
              : '"cfLxXi6wCtW5oIhUh260Yy"',
          },
        }),
    );
    expect(
      await scrydexRealLogo("https://images.scrydex.com/pokemon/pcg1_ja-logo/logo"),
    ).toBeNull();
    expect(await scrydexRealLogo("https://images.scrydex.com/pokemon/mcd23-logo/logo")).toBe(
      "https://images.scrydex.com/pokemon/mcd23-logo/logo",
    );
    vi.unstubAllGlobals();
  });
});

describe("scrydexCodeByName", () => {
  const logo = (code: string) => ({ logo: `https://images.scrydex.com/pokemon/${code}-logo/logo` });
  const sets = [
    { id: "me55", name: "30th Celebration", images: logo("me55") },
    { id: "me55c", name: "30th Celebration: Classic Collection", images: logo("me55c") },
    {
      id: "sv1",
      name: "Scarlet & Violet",
      images: { logo: "https://images.pokemontcg.io/sv1/logo.png" },
    },
  ];

  it("finds the one set carrying the name exactly, by its Scrydex logo's code", () => {
    expect(scrydexCodeByName(sets, "30th Celebration")).toBe("me55");
    expect(scrydexCodeByName(sets, "30th Celebration: Classic Collection")).toBe("me55c");
  });

  it("takes the set's own id where its logo is not a Scrydex address", () => {
    expect(scrydexCodeByName(sets, "Scarlet & Violet")).toBe("sv1");
  });

  it("does not take a near name for the set: punctuation, case and a subset's longer name", () => {
    expect(scrydexCodeByName(sets, "30th Celebration Classic Collection")).toBeNull();
    expect(scrydexCodeByName(sets, "30th celebration")).toBeNull();
    expect(scrydexCodeByName(sets, "30th")).toBeNull();
  });

  it("gives nothing where two sets carry the name", () => {
    expect(
      scrydexCodeByName(
        [...sets, { id: "me55x", name: "30th Celebration", images: logo("me55x") }],
        "30th Celebration",
      ),
    ).toBeNull();
  });
});

describe("scrydexEnglishLogo", () => {
  const REAL = '"cfAAgeVIgeVw8r-OTYwsfQ4URUgITfWme2fetQNLVvDQ"';
  /** Scrydex answering a real logo for every code; pokemontcg.io as `ptcg` says. */
  const stub = (ptcg: () => Response) => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return url.startsWith("https://api.pokemontcg.io/")
        ? ptcg()
        : new Response(null, { status: 200, headers: { etag: REAL } });
    });
    return asked;
  };
  const fresh = async () => {
    vi.resetModules();
    return (await import("./scrydex-japan-logos")).scrydexEnglishLogo;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("gives 30th Celebration its logo from the written code, without asking pokemontcg.io", async () => {
    const asked = stub(() => new Response(null, { status: 502 }));
    const logo = await (await fresh())("30th", "30th Celebration");
    expect(logo).toBe("https://images.scrydex.com/pokemon/me55-logo/logo");
    expect(asked.some((u) => u.includes("pokemontcg.io"))).toBe(false);
  });

  it("finds a set nobody wrote down by its exact name on pokemontcg.io", async () => {
    stub(() =>
      Response.json({
        data: [
          {
            id: "me9",
            name: "Brand New Set",
            images: { logo: "https://images.scrydex.com/pokemon/me9-logo/logo" },
          },
        ],
      }),
    );
    expect(await (await fresh())("me09", "Brand New Set")).toBe(
      "https://images.scrydex.com/pokemon/me9-logo/logo",
    );
  });

  it("gives nothing, rather than failing the set, where pokemontcg.io refuses every try", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const asked = stub(() => new Response(null, { status: 502 }));
    const pending = (await fresh())("me09", "Brand New Set");
    await vi.runAllTimersAsync();
    expect(await pending).toBeNull();
    expect(asked.filter((u) => u.includes("pokemontcg.io"))).toHaveLength(3);
  });
});

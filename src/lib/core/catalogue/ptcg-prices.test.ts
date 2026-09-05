import { afterEach, describe, expect, it, vi } from "vitest";
import { ptcgPrices } from "./ptcg";

const SETS = {
  data: [
    { id: "swshp", name: "SWSH Black Star Promos" },
    { id: "swsh12", name: "Silver Tempest" },
    { id: "swsh12tg", name: "Silver Tempest Trainer Gallery" },
  ],
};
const card = (number: string, market: number) => ({
  id: `x-${number}`,
  number,
  tcgplayer: { prices: { holofoil: { market, low: market - 1 } } },
});

function stub(pages: Record<string, unknown[] | number>) {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/v2/sets")) return new Response(JSON.stringify(SETS), { status: 200 });
    const id = decodeURIComponent(url).match(/set\.id:([^&]+)/)?.[1] ?? "";
    const answer = pages[id];
    if (typeof answer === "number") return new Response("", { status: answer });
    return new Response(JSON.stringify({ data: answer ?? [], totalCount: (answer ?? []).length }), {
      status: 200,
    });
  });
}

describe("ptcgPrices", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keys a prefixed promo number under its digits too, the printed form winning", async () => {
    vi.stubGlobal("fetch", stub({ swshp: [card("SWSH282", 5), card("282", 9)] }));
    const out = await ptcgPrices("SWSH Black Star Promos");
    expect(out?.get("282")?.market).toBe(9);
    expect(out?.get("SWSH282")?.market).toBe(5);
  });

  it("merges a set's gallery under its own TG numbers", async () => {
    vi.stubGlobal("fetch", stub({ swsh12: [card("12", 2)], swsh12tg: [card("TG12", 30)] }));
    const out = await ptcgPrices("Silver Tempest");
    expect(out?.get("12")?.market).toBe(2);
    expect(out?.get("TG12")?.market).toBe(30);
  });

  it("is null when the search fails, and nothing when the index lacks the set", async () => {
    vi.stubGlobal("fetch", stub({ swshp: 502 }));
    expect(await ptcgPrices("SWSH Black Star Promos")).toBeNull();
    vi.stubGlobal("fetch", stub({}));
    expect((await ptcgPrices("No Such Set"))?.size).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withLimitlessScans } from "./browse-artwork";
import type { CatalogueMatch } from "./ptcg-search";

/**
 * A Japanese set TCGdex has not photographed gets Limitless's scans; one it
 * has keeps its own. Decided once per set, on the first card.
 */

const TCGDEX = "https://assets.tcgdex.net/ja/SV/SV5M";
const card = (localId: string, over: Partial<CatalogueMatch> = {}): CatalogueMatch => ({
  id: `SV5M-${localId}`,
  number: localId,
  name: "ストライク",
  localName: null,
  setName: "サイバージャッジ",
  image: `${TCGDEX}/${localId}/low.webp`,
  imageHigh: `${TCGDEX}/${localId}/high.webp`,
  rarity: null,
  types: [],
  series: null,
  ...over,
});
const cover = (file: string) =>
  `/api/cover?url=${encodeURIComponent(`https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV5M/${file}`)}`;

describe("withLimitlessScans", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("keeps TCGdex's scans where the set has them, after one probe", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    const cards = [card("001"), card("002")];
    await expect(withLimitlessScans("ja", cards)).resolves.toEqual(cards);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${TCGDEX}/001/low.webp`);
  });

  it("guesses Limitless's address for every card where the set has none", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    const out = await withLimitlessScans("ja", [card("001"), card("012"), card("100")]);
    // The number without its padding: SV5M-001 is SV5M_1 there.
    expect(out.map((c) => c.image)).toEqual([
      cover("SV5M_1_R_JP_SM.png"),
      cover("SV5M_12_R_JP_SM.png"),
      cover("SV5M_100_R_JP_SM.png"),
    ]);
    expect(out[0]?.imageHigh).toBe(cover("SV5M_1_R_JP_LG.png"));
    // One probe for the set, none for the guesses.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("swaps a set TCGdex photographed in its reverse variant, and spends no probe on it", async () => {
    // Pokémon Card 151: every TCGdex scan is the Master Ball print, seen on 2026-09-11.
    const cards = [
      card("001", { id: "SV2a-001", image: "https://assets.tcgdex.net/ja/SV/SV2a/001/low.webp" }),
    ];
    const out = await withLimitlessScans("ja", cards);
    expect(out[0]!.image).toBe(
      `/api/cover?url=${encodeURIComponent("https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV2a/SV2a_1_R_JP_SM.png")}`,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("gives a card the record names no picture for Limitless's, while the set keeps its own", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    const out = await withLimitlessScans("ja", [
      card("001"),
      card("002", { image: null, imageHigh: null }),
    ]);
    expect(out[0]!.image).toBe(`${TCGDEX}/001/low.webp`);
    expect(out[1]!.image).toBe(cover("SV5M_2_R_JP_SM.png"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("guesses every card without a probe where none of them names a picture", async () => {
    const out = await withLimitlessScans("ja", [card("001", { image: null, imageHigh: null })]);
    expect(out[0]!.image).toBe(cover("SV5M_1_R_JP_SM.png"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the set's own pictures when the probe cannot be made", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const cards = [card("001")];
    await expect(withLimitlessScans("ja", cards)).resolves.toEqual(cards);
  });

  it("leaves the other shelves alone: Limitless has no Korean or Chinese cards", async () => {
    const cards = [card("001", { id: "SV5M-001" })];
    await expect(withLimitlessScans("zh-tw", cards)).resolves.toBe(cards);
    await expect(withLimitlessScans("ko", cards)).resolves.toBe(cards);
    expect(fetch).not.toHaveBeenCalled();
  });
});

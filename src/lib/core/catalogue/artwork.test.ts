import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limitlessJapaneseScan, scrydexScan, storedScan, tcgdexScan } from "./artwork";

const BASE = "https://assets.tcgdex.net/en/sm/smp/SM191";

describe("tcgdexScan", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands the path over when the file is there", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    await expect(tcgdexScan(BASE)).resolves.toBe(BASE);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${BASE}/low.webp`);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" });
  });

  it("says nothing rather than a 404, so the fallbacks get their turn", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await expect(tcgdexScan(BASE)).resolves.toBeNull();
  });

  it("keeps the path when the probe itself cannot be made: an unanswered check is not proof", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    await expect(tcgdexScan(BASE)).resolves.toBe(BASE);
  });
});

describe("storedScan", () => {
  it("reads a stem as a folder, both sizes", () => {
    expect(storedScan("https://assets.tcgdex.net/en/sv/svp/085")).toEqual({
      image: "https://assets.tcgdex.net/en/sv/svp/085/low.webp",
      imageHigh: "https://assets.tcgdex.net/en/sv/svp/085/high.webp",
    });
  });

  it("reads a file as the one size there is: the fallbacks publish one each", () => {
    expect(storedScan("https://images.pokemontcg.io/svp/85.png")).toEqual({
      image: "https://images.pokemontcg.io/svp/85.png",
      imageHigh: null,
    });
    expect(storedScan("/api/cover?url=https%3A%2F%2Flimitless%2FSVP_085_R_EN_LG.png")).toEqual({
      image: "/api/cover?url=https%3A%2F%2Flimitless%2FSVP_085_R_EN_LG.png",
      imageHigh: null,
    });
  });

  it("answers nothing for a card with no picture, which draws as its name", () => {
    expect(storedScan(null)).toEqual({ image: null, imageHigh: null });
  });
});

describe("scrydexScan for cards read by hand", () => {
  it("asks for Pikachu at the Museum under the number Scrydex files it at", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return new Response(null, { status: 200, headers: { etag: '"real"' } });
    });
    expect(await scrydexScan("mep", "Museum")).toBe(
      "https://images.scrydex.com/pokemon/mep-1000/large",
    );
    expect(await scrydexScan("ex5.5", "3")).toBe("https://images.scrydex.com/pokemon/wb1-3/large");
    vi.unstubAllGlobals();
  });
});

describe("scrydexScan", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => vi.unstubAllGlobals());
  // No Content-Length: Scrydex sends none to a server, only the ETag.
  const answer = (etag: string) => new Response(null, { status: 200, headers: { etag } });

  it("takes a set read by hand, at the number without its padding", async () => {
    fetchMock.mockResolvedValue(answer('W/"cfIW1_cPdxyo2OZPoh_Oh-4oGBCRBILXPqV9Rt6Cz3DQ"'));
    expect(await scrydexScan("tk-xy-b", "016")).toBe(
      "https://images.scrydex.com/pokemon/tk7b-16/large",
    );
  });

  it("refuses Scrydex's stand-in picture, a set nobody read, and a lettered number", async () => {
    fetchMock.mockResolvedValue(answer('W/"cfl2loWl84E8tUjrC-Q-I0D0JhCRBILXPqV9Rt6Cz3DQ"'));
    expect(await scrydexScan("tk-xy-b", "16")).toBeNull();
    fetchMock.mockReset();
    expect(await scrydexScan("base1", "4")).toBeNull();
    expect(await scrydexScan("tk-xy-b", "SWSH1")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("limitlessJapaneseScan", () => {
  const file = (address: string) => decodeURIComponent(address.replace("/api/cover?url=", ""));

  it("reads a set's own abbreviation and the number without its padding", () => {
    expect(file(limitlessJapaneseScan("SV5M-001", "001").high)).toBe(
      "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV5M/SV5M_1_R_JP_LG.png",
    );
  });

  it("writes a promo set without its hyphen, the way Limitless files it", () => {
    expect(file(limitlessJapaneseScan("SV-P-188", "188").high)).toBe(
      "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SVP/SVP_188_R_JP_LG.png",
    );
    expect(file(limitlessJapaneseScan("M-P-164", "164").low)).toBe(
      "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/MP/MP_164_R_JP_SM.png",
    );
  });
});

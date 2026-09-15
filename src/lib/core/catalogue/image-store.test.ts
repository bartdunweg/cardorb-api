import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canStoreImages,
  imageKey,
  keepImage,
  ownPicture,
  storedAddress,
  withOwnArt,
  withOwnScans,
} from "./image-store";
import { ownScan } from "./artwork";

const WRITER = "https://cardorb-images-writer.bart-dunweg.workers.dev";

describe("imageKey", () => {
  it("keeps a TCGdex folder's own path, so a stored folder reads like the source's", () => {
    expect(imageKey("https://assets.tcgdex.net/en/swsh/swsh11/186")).toBe("en/swsh/swsh11/186");
  });

  it("files another catalogue's picture under that catalogue's name", () => {
    expect(imageKey("https://images.pokemontcg.io/sm75/1.png")).toBe("pokemontcg/sm75/1.png");
    expect(
      imageKey(
        "/api/cover?url=" +
          encodeURIComponent(
            "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/DRM/DRM_024_R_EN_LG.png",
          ),
      ),
    ).toBe("limitless/tpci/DRM/DRM_024_R_EN_LG.png");
    expect(imageKey("https://images.scrydex.com/pokemon/tk7b-16/large")).toBe(
      "scrydex/tk7b-16.png",
    );
    expect(imageKey("https://tcgplayer-cdn.tcgplayer.com/product/90168_in_1000x1000.jpg")).toBe(
      "tcgplayer/90168.jpg",
    );
  });

  it("answers null for our own address, an unknown host and a climbing path", () => {
    expect(imageKey("https://images.cardorb.com/en/swsh/swsh11/186")).toBeNull();
    expect(imageKey("https://example.com/a.png")).toBeNull();
    expect(imageKey("not a url")).toBeNull();
    expect(storedAddress("https://assets.tcgdex.net/en/swsh/swsh11/186")).toBe(
      "https://images.cardorb.com/en/swsh/swsh11/186",
    );
  });
});

describe("ownPicture", () => {
  // Bart, 2026-09-15: every picture a client is sent is a file in our bucket, or null.
  it("passes a file of ours and nothing else", () => {
    expect(ownPicture("https://images.cardorb.com/en/swsh/swsh11/186")).toBe(
      "https://images.cardorb.com/en/swsh/swsh11/186",
    );
    for (const outside of [
      "https://assets.tcgdex.net/en/swsh/swsh11/186",
      "https://images.pokemontcg.io/sm75/1.png",
      "https://images.scrydex.com/pokemon/tk7b-16/large",
      "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/DRM/DRM_024_R_EN_LG.png",
      "https://tcgplayer-cdn.tcgplayer.com/product/90168_in_1000x1000.jpg",
      "/api/cover?url=https%3A%2F%2Flimitlesstcg.nyc3.cdn.digitaloceanspaces.com%2Fx.png",
      "https://images.cardorb.com.example.com/x.png",
      "",
    ])
      expect(ownPicture(outside)).toBeNull();
    expect(ownPicture(null)).toBeNull();
    expect(ownPicture(undefined)).toBeNull();
  });

  it("shapes a card's scans and a set's art, and leaves out a field the thing did not have", () => {
    expect(
      withOwnScans({
        id: "a",
        image: "https://assets.tcgdex.net/en/x/1/low.webp",
        imageHigh: "https://images.cardorb.com/en/x/1/high.webp",
      }),
    ).toEqual({ id: "a", image: null, imageHigh: "https://images.cardorb.com/en/x/1/high.webp" });
    expect(withOwnScans({ image: "https://images.pokemontcg.io/x/1.png" })).toEqual({
      image: null,
    });
    expect(
      withOwnArt({ id: "s", logo: "https://images.pokemontcg.io/s/logo.png", symbol: null }),
    ).toEqual({ id: "s", logo: null, symbol: null });
    expect(withOwnArt({ logo: "https://images.cardorb.com/s/logo.webp" })).toEqual({
      logo: "https://images.cardorb.com/s/logo.webp",
    });
  });

  it("reads a stored folder or file of ours as both sizes or one, and anything else as none", () => {
    expect(ownScan("https://images.cardorb.com/en/sv/sv03.5/006")).toEqual({
      image: "https://images.cardorb.com/en/sv/sv03.5/006/low.webp",
      imageHigh: "https://images.cardorb.com/en/sv/sv03.5/006/high.webp",
    });
    expect(ownScan("https://images.cardorb.com/pokemontcg/svp/85.png")).toEqual({
      image: "https://images.cardorb.com/pokemontcg/svp/85.png",
      imageHigh: null,
    });
    expect(ownScan("https://assets.tcgdex.net/en/sv/sv03.5/006")).toEqual({
      image: null,
      imageHigh: null,
    });
  });
});

describe("keepImage", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("changes nothing and asks nobody without the write secret", async () => {
    vi.stubEnv("IMAGES_WRITE_SECRET", "");
    expect(await keepImage("https://images.pokemontcg.io/sm75/1.png")).toBe(
      "https://images.pokemontcg.io/sm75/1.png",
    );
    expect(await canStoreImages()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("copies both scans of a TCGdex folder and hands out our folder", async () => {
    vi.stubEnv("IMAGES_WRITE_SECRET", "s");
    const put: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") return new Response(null, { status: 404 });
      if (url.startsWith(WRITER) && init?.method === "PUT") {
        put.push(url);
        return new Response(null, { status: 201 });
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    expect(await keepImage("https://assets.tcgdex.net/en/swsh/swsh11/186")).toBe(
      "https://images.cardorb.com/en/swsh/swsh11/186",
    );
    expect(put.sort()).toEqual([
      `${WRITER}/en/swsh/swsh11/186/high.webp`,
      `${WRITER}/en/swsh/swsh11/186/low.webp`,
    ]);
  });

  it("keeps the source's address when the large scan cannot be copied", async () => {
    vi.stubEnv("IMAGES_WRITE_SECRET", "s");
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") return new Response(null, { status: 404 });
      if (url.startsWith(WRITER)) return new Response(null, { status: 201 });
      return new Response(url.endsWith("high.webp") ? null : new Uint8Array([1]), {
        status: url.endsWith("high.webp") ? 404 : 200,
      });
    });
    expect(await keepImage("https://assets.tcgdex.net/en/swsh/swsh11/186")).toBe(
      "https://assets.tcgdex.net/en/swsh/swsh11/186",
    );
  });

  it("does not fetch a file the bucket already holds", async () => {
    vi.stubEnv("IMAGES_WRITE_SECRET", "s");
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    expect(await keepImage("https://images.pokemontcg.io/sm75/1.png")).toBe(
      "https://images.cardorb.com/pokemontcg/sm75/1.png",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://images.cardorb.com/pokemontcg/sm75/1.png");
  });
});

describe("tcgdexFolderMissing", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is true only when TCGdex answers 404 for a size", async () => {
    const { tcgdexFolderMissing } = await import("./image-store");
    fetchMock.mockImplementation(
      async (url: string) => new Response(null, { status: url.endsWith("high.webp") ? 404 : 200 }),
    );
    expect(await tcgdexFolderMissing("https://assets.tcgdex.net/en/sv/sv03.5/163")).toBe(true);
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    expect(await tcgdexFolderMissing("https://assets.tcgdex.net/en/sv/sv03.5/163")).toBe(false);
    fetchMock.mockRejectedValue(new Error("down"));
    expect(await tcgdexFolderMissing("https://assets.tcgdex.net/en/sv/sv03.5/163")).toBe(false);
    expect(await tcgdexFolderMissing("https://images.pokemontcg.io/sm75/1.png")).toBe(false);
  });
});

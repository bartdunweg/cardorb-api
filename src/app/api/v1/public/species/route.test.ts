import { describe, expect, it } from "vitest";
import { GET } from "./route";

const get = () => GET(new Request("https://api.cardorb.com/v1/public/species"));

type Body = { entries: { id: number; name: string }[] };

describe("GET /api/v1/public/species", () => {
  it("answers without a token", async () => {
    const res = get();
    expect(res.status).toBe(200);
  });

  it("names every National Dex slot, in order", async () => {
    const body = (await get().json()) as Body;
    expect(body.entries).toHaveLength(1025);
    expect(body.entries[0]).toEqual({ id: 1, name: "Bulbasaur" });
    expect(body.entries.at(-1)?.id).toBe(1025);
    expect(body.entries.map((e) => e.id)).toEqual(body.entries.map((_, i) => i + 1));
  });

  it("says nothing about any caller", async () => {
    const body = (await get().json()) as Body;
    expect(Object.keys(body)).toEqual(["entries"]);
    // The counts and the thumbnails are GET /v1/pokedex's, and that route asks
    // for a key. A field creeping in here would hand them out unkeyed.
    for (const entry of body.entries) expect(Object.keys(entry)).toEqual(["id", "name"]);
  });

  it("is cached, unlike the reads that carry somebody's collection", () => {
    expect(get().headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { languagesOf, westernLanguagesOf } from "./card-languages";

afterEach(() => vi.unstubAllGlobals());

/** Every Western catalogue answers 404 but the ones named. */
const answering = (...langs: string[]) =>
  vi.stubGlobal("fetch", async (url: string) => {
    const ok = langs.some((l) => url.includes(`/v2/${l}/`));
    return new Response(ok ? JSON.stringify({ id: "x-1" }) : "", { status: ok ? 200 : 404 });
  });

describe("westernLanguagesOf", () => {
  it("asks each Western catalogue and keeps the ones that carry the card", async () => {
    answering("en", "de", "pt");
    expect(await westernLanguagesOf("x-1")).toEqual(["en", "de", "pt"]);
  });

  it("keeps English alone for a card only the English catalogue has", async () => {
    answering("en");
    expect(await westernLanguagesOf("x-1")).toEqual(["en"]);
  });

  it("drops Portuguese standing alone beside English, which is a translation", async () => {
    answering("en", "pt");
    expect(await westernLanguagesOf("svp-085")).toEqual(["en"]);
  });

  it("never asks for Dutch, which has no catalogue to ask", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return new Response("", { status: 404 });
    });
    await westernLanguagesOf("x-1");
    expect(asked.some((u) => u.includes("/v2/nl/"))).toBe(false);
  });

  it("says nothing at all where a catalogue was asked and did not answer", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/v2/de/")) throw new Error("down");
      return new Response("", { status: 404 });
    });
    expect(await westernLanguagesOf("x-1")).toBeNull();
  });
});

describe("languagesOf", () => {
  it("lets the set decide where Bulbapedia says what it was printed in", async () => {
    // A Dutch Base Set exists and TCGdex keeps no Dutch catalogue at all; a Spanish one exists
    // and its Spanish record holds zero cards. Neither is asked for a set in the map.
    vi.stubGlobal("fetch", async () => {
      throw new Error("no catalogue is asked for a set in the map");
    });
    expect(await languagesOf("base1-4", "base1")).toEqual([
      "en",
      "de",
      "fr",
      "it",
      "es",
      "pt",
      "nl",
    ]);
  });

  it("offers a set released in English alone that alone", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 500 }));
    expect(await languagesOf("gym1-1", "gym1")).toEqual(["en"]);
  });

  it("asks the catalogue per card for a set the map does not have", async () => {
    answering("en", "de");
    expect(await languagesOf("sv01-001", "sv01")).toEqual(["en", "de"]);
    expect(await languagesOf("sv01-001", null)).toEqual(["en", "de"]);
  });
});

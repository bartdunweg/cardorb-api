import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetOnTheWeb, webSetOf, webSetOfAll, WEB_WRITES } from "./web-cache";

// The name the web files a public page under is read here rather than carried on every
// authorised request (viewer.ts); the routes hand over the id and their token.
const usernameOf = vi.hoisted(() => vi.fn(async () => "me"));
vi.mock("./viewer", () => ({ usernameOf }));

/**
 * The word to cardorb.com after a profile change: one POST with the shared
 * secret, and never a reason for the change itself to fail.
 */
describe("forgetOnTheWeb", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("WEB_REVALIDATE_URL", "https://cardorb.com/api/revalidate");
    vi.stubEnv("WEB_REVALIDATE_SECRET", "s3cret");
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("posts who changed, with the secret", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    await forgetOnTheWeb({ userId: "me-uuid", token: "t" }, "cards");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://cardorb.com/api/revalidate");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer s3cret");
    expect(JSON.parse(String(init.body))).toEqual({
      userId: "me-uuid",
      username: "me",
      write: "cards",
    });
  });

  it("names the write, one of the five the web's route knows", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    for (const write of WEB_WRITES) await forgetOnTheWeb({ userId: "me-uuid" }, write);
    const sent = fetch.mock.calls.map(
      (call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).write,
    );
    expect(sent).toEqual(["all", "cards", "favorite", "binders", "profile", "dexFace"]);
  });

  it("carries the set the route named, so the web drops that set's page alone", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    await forgetOnTheWeb({ userId: "me-uuid", token: "t" }, "cards", "base1");
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      userId: "me-uuid",
      username: "me",
      write: "cards",
      set: "base1",
    });
  });

  it("leaves the set out where the route does not know it, which is every set page as before", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    await forgetOnTheWeb({ userId: "me-uuid", token: "t" }, "cards", null);
    await forgetOnTheWeb({ userId: "me-uuid", token: "t" }, "cards");
    for (const call of fetch.mock.calls) {
      const body = JSON.parse(String((call as unknown as [string, RequestInit])[1].body));
      expect(body).not.toHaveProperty("set");
    }
  });

  it("says nothing where it is not configured, and asks Postgres nothing either", async () => {
    vi.stubEnv("WEB_REVALIDATE_SECRET", "");
    usernameOf.mockClear();
    const fetch = vi.fn();
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    await forgetOnTheWeb({ userId: "me-uuid", token: "t" }, "all");
    expect(fetch).not.toHaveBeenCalled();
    expect(usernameOf).not.toHaveBeenCalled();
  });

  it("reads a set off a card id at its last dash, and off a group only where they share one", () => {
    expect(webSetOf("base1-58")).toBe("base1");
    expect(webSetOf("sv03.5-100")).toBe("sv03.5");
    // A Japanese promo id holds a dash of its own: the set is `S-P`, not `S`.
    expect(webSetOf("S-P-051")).toBe("S-P");
    expect(webSetOf(null)).toBeNull();
    expect(webSetOfAll(["base1-58", "base1-4"])).toBe("base1");
    expect(webSetOfAll(["base1-58", "sv03pt5-25"])).toBeNull();
    expect(webSetOfAll(["base1-58", null])).toBeNull();
    expect(webSetOfAll([])).toBeNull();
  });

  it("swallows a web that does not answer, and one that refuses", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof globalThis.fetch;
    await expect(forgetOnTheWeb({ userId: "me-uuid", token: "t" }, "all")).resolves.toBeUndefined();
    globalThis.fetch = vi.fn(
      async () => new Response("no", { status: 401 }),
    ) as unknown as typeof globalThis.fetch;
    await expect(forgetOnTheWeb({ userId: "me-uuid", token: "t" }, "all")).resolves.toBeUndefined();
  });
});

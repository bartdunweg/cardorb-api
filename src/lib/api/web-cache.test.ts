import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetOnTheWeb } from "./web-cache";

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
    await forgetOnTheWeb({ userId: "me-uuid", token: "t" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://cardorb.com/api/revalidate");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer s3cret");
    expect(JSON.parse(String(init.body))).toEqual({ userId: "me-uuid", username: "me" });
  });

  it("says nothing where it is not configured, and asks Postgres nothing either", async () => {
    vi.stubEnv("WEB_REVALIDATE_SECRET", "");
    usernameOf.mockClear();
    const fetch = vi.fn();
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    await forgetOnTheWeb({ userId: "me-uuid", token: "t" });
    expect(fetch).not.toHaveBeenCalled();
    expect(usernameOf).not.toHaveBeenCalled();
  });

  it("swallows a web that does not answer, and one that refuses", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof globalThis.fetch;
    await expect(forgetOnTheWeb({ userId: "me-uuid", token: "t" })).resolves.toBeUndefined();
    globalThis.fetch = vi.fn(
      async () => new Response("no", { status: 401 }),
    ) as unknown as typeof globalThis.fetch;
    await expect(forgetOnTheWeb({ userId: "me-uuid", token: "t" })).resolves.toBeUndefined();
  });
});

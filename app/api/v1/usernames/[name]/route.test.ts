import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The endpoint that says whether a name belongs to somebody.
 *
 * Its own docstring calls enumeration "the threat" and names three defences.
 * For a while only two of them existed: the same-origin check was written down
 * and never written. A page on any domain could run this against every one of
 * its visitors, and each visitor's address got its own bucket in a per-instance
 * map — so the rate limit, which is the defence that was there, counted the
 * wrong thing entirely.
 *
 * These tests are the ones that would have caught that. `adminClient` is
 * stubbed: what is under test is the guard and the shape of the answer, not
 * Postgres.
 */

// The route reaches lib/api/guard.ts for sameOrigin(), which reaches
// lib/storage/supabase.ts, which is `import "server-only"` — and that throws on
// import outside a React Server Component. Same neutering as
// app/api/v1/session/route.test.ts does, for the same reason.
vi.mock("server-only", () => ({}));

const maybeSingle = vi.fn();
const adminClient = vi.fn();
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => adminClient() }));

const { GET } = await import("./route");

const params = (name: string) => ({ params: Promise.resolve({ name }) });

/** An address of its own per test, because the limiter is module state. */
const from = (origin: string | null, ip: string) =>
  new Request("https://cardorb.example/api/v1/usernames/free-name", {
    headers: {
      host: "cardorb.example",
      "x-real-ip": ip,
      ...(origin ? { origin } : {}),
    },
  });

beforeEach(() => {
  maybeSingle.mockResolvedValue({ data: null });
  adminClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/usernames/[name]", () => {
  it("answers this app's own sign-up form", async () => {
    const res = await GET(from("https://cardorb.example", "198.51.100.1"), params("free-name"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true });
  });

  it("refuses a script running on somebody else's page", async () => {
    const res = await GET(from("https://evil.example", "198.51.100.2"), params("free-name"));
    expect(res.status).toBe(403);
    // And never asks the database: an off-origin caller should not be able to
    // make this deployment do work, let alone learn the answer.
    expect(adminClient).not.toHaveBeenCalled();
  });

  it("still answers a request with no Origin at all", async () => {
    // Deliberate, and worth a test rather than a comment: sameOrigin() passes a
    // request with no Origin header (lib/api/guard.ts), so curl still gets
    // through. The docstring's claim is that enumeration is slow and
    // attributable, not impossible, and this is the line where that is true.
    const res = await GET(from(null, "198.51.100.3"), params("free-name"));
    expect(res.status).toBe(200);
  });

  it("says the same thing about a taken name and a reserved one", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "someone" } });
    const res = await GET(from("https://cardorb.example", "198.51.100.4"), params("taken-name"));
    const body = await res.json();
    expect(body.available).toBe(false);
    // No id, no address, nothing about an owner — only that it is unavailable.
    expect(JSON.stringify(body)).not.toContain("someone");
  });

  it("rejects a malformed name without asking the database", async () => {
    const res = await GET(from("https://cardorb.example", "198.51.100.5"), params("A"));
    expect((await res.json()).available).toBe(false);
    expect(adminClient).not.toHaveBeenCalled();
  });
});

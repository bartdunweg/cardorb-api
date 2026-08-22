import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Whose value history, asked out loud.
 *
 * This route used to import a committed JSON file and hand the identical series
 * to every authenticated caller — one account's holdings, read by all of them.
 * The assertions below are the ones that would have failed then: the userId
 * reaching the store is the caller's, two callers do not get the same answer,
 * and the shape the iOS app parses has not moved.
 */

const authorise = vi.fn();
const getValueHistory = vi.fn();

// The real guard.ts pulls in lib/api/viewer.ts, which is `import "server-only"`
// — fine under Next's bundler, fatal under plain vitest. Replaced wholesale,
// like every other route test here.
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
vi.mock("@/lib/core/collection", () => ({
  getValueHistory: (...a: unknown[]) => getValueHistory(...a),
}));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const SNAPSHOT = {
  date: "2026-08-06",
  value: 39_887,
  cards: 1524,
  priced: 1211,
  unpriced: 313,
};

const get = (token = "t.o.k.e.n") =>
  GET(
    new Request("https://cardorb.com/api/v1/value-history", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue(VIEWER);
  getValueHistory.mockResolvedValue([SNAPSHOT]);
});

describe("GET /api/v1/value-history", () => {
  it("asks for the caller's own history, with the caller's own credential", async () => {
    await get();
    // The token as well as the id: this table's only policy is
    // `user_id = auth.uid()`, so a client that names nobody gets nothing.
    expect(getValueHistory).toHaveBeenCalledWith("me-uuid", "t.o.k.e.n");
  });

  it("does not hand one account another's series", async () => {
    authorise.mockResolvedValue({ ...VIEWER, userId: "someone-else" });
    getValueHistory.mockResolvedValue([]);
    const body = await (await get()).json();
    expect(getValueHistory).toHaveBeenCalledWith("someone-else", "t.o.k.e.n");
    expect(body).toEqual({ snapshots: [] });
  });

  it("keeps the shape the iOS app parses", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ snapshots: [SNAPSHOT] });
  });

  it("answers an account that has never been snapshotted with an empty series", async () => {
    // Not a 404 and not an error: having no history is the ordinary state of
    // every account but one, and the card draws nothing for it.
    getValueHistory.mockResolvedValue([]);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ snapshots: [] });
  });

  it("passes a refusal through rather than turning it into an empty 200", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Who are you?" });
    const res = await get();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Who are you?" });
    expect(getValueHistory).not.toHaveBeenCalled();
  });
});

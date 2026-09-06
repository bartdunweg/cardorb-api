import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublicCollection = vi.fn();
const listAccountIds = vi.fn();
vi.mock("@/lib/core/collection/collection", () => ({
  getPublicCollection: (...a: unknown[]) => getPublicCollection(...a),
}));
vi.mock("@/lib/storage/postgres", () => ({
  listAccountIds: (...a: unknown[]) => listAccountIds(...a),
}));
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => ({}) }));

const { GET } = await import("./route");

const get = (auth?: string) =>
  GET(
    new Request("https://api.cardorb.com/v1/cron/warm", {
      headers: auth ? { authorization: auth } : {},
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cret";
  listAccountIds.mockResolvedValue(["u1", "u2"]);
  getPublicCollection.mockResolvedValue({ sets: [{}, {}], failed: false });
});

describe("GET /api/v1/cron/warm", () => {
  it("refuses anyone but the cron", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("Bearer wrong")).status).toBe(401);
  });

  it("assembles every account and says so", async () => {
    const res = await get("Bearer s3cret");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warmed.map((w: { user: string; sets: number }) => [w.user, w.sets])).toEqual([
      ["u1", 2],
      ["u2", 2],
    ]);
    expect(body.failed).toEqual([]);
  });

  it("is a 207 naming the accounts that could not be assembled", async () => {
    getPublicCollection.mockResolvedValueOnce({ sets: [], failed: true });
    const res = await get("Bearer s3cret");
    expect(res.status).toBe(207);
    expect((await res.json()).failed).toEqual(["u1"]);
  });
});

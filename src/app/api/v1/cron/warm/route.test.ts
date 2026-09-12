import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublicCollection = vi.fn();
const rememberCollectionScans = vi.fn();
const listAccountIds = vi.fn();
vi.mock("@/lib/core/collection/collection", () => ({
  getPublicCollection: (...a: unknown[]) => getPublicCollection(...a),
  rememberCollectionScans: (...a: unknown[]) => rememberCollectionScans(...a),
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
  rememberCollectionScans.mockResolvedValue(0);
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

  it("writes down the pictures it just resolved, and says how many", async () => {
    rememberCollectionScans.mockResolvedValue(7);
    const body = await (await get("Bearer s3cret")).json();
    expect(rememberCollectionScans).toHaveBeenCalledTimes(2);
    expect(body.warmed.map((w: { remembered: number }) => w.remembered)).toEqual([7, 7]);
  });

  it("remembers nothing off a collection served without the catalogue", async () => {
    // Those cards carry what the rows already remember, so writing it back would be the
    // memory copying itself, and a catalogue outage must never reach the store at all.
    getPublicCollection.mockResolvedValue({
      sets: [{}],
      failed: false,
      catalogueUnavailable: true,
    });
    await get("Bearer s3cret");
    expect(rememberCollectionScans).not.toHaveBeenCalled();
  });

  it("warms the rest when one collection cannot remember its pictures", async () => {
    rememberCollectionScans.mockRejectedValueOnce(new Error("store is down"));
    const res = await get("Bearer s3cret");
    expect(res.status).toBe(200);
    expect((await res.json()).warmed).toHaveLength(2);
  });

  it("is a 207 naming the accounts that could not be assembled", async () => {
    getPublicCollection.mockResolvedValueOnce({ sets: [], failed: true });
    const res = await get("Bearer s3cret");
    expect(res.status).toBe(207);
    expect((await res.json()).failed).toEqual(["u1"]);
  });
});

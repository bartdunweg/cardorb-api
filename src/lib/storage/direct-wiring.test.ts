import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Where the direct reads plug in (storage/collection.ts). With the connection answering
 * undefined (DATABASE_POOLER_URL unset, or a failure) every read is the gateway read it was
 * before, with the same client; with it answering, the gateway is not asked. The anonymous
 * fallback never goes direct: profiles_read is what keeps a private row from it.
 */
const direct = vi.hoisted(() => ({
  directCardsVersion: vi.fn(),
  directLatestUsdEurRate: vi.fn(),
}));
const postgres = vi.hoisted(() => ({ cardsVersion: vi.fn(), readLatestUsdEurRate: vi.fn() }));
const anon = vi.hoisted(() => ({ anon: true }));

vi.mock("./direct", () => direct);
vi.mock("./postgres", () => postgres);
vi.mock("./supabase", () => ({
  readClient: () => anon,
  serverClient: vi.fn(),
  userClient: vi.fn(),
}));

const { cardsVersion, latestUsdEurRate } = await import("./collection");
const USER = "00000000-0000-0000-0000-000000000001";
const mine = { mine: true } as unknown as SupabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
  postgres.cardsVersion.mockResolvedValue(5);
  postgres.readLatestUsdEurRate.mockResolvedValue({ day: "2026-09-18", rate: 0.85 });
});

describe("cardsVersion", () => {
  it("asks the gateway with the caller's client where there is no direct answer", async () => {
    direct.directCardsVersion.mockResolvedValue(undefined);
    expect(await cardsVersion(USER, mine)).toBe(5);
    expect(postgres.cardsVersion).toHaveBeenCalledWith(mine, USER);
  });

  it("takes the direct answer, null included, and does not ask the gateway", async () => {
    direct.directCardsVersion.mockResolvedValue(9);
    expect(await cardsVersion(USER, mine)).toBe(9);
    direct.directCardsVersion.mockResolvedValue(null);
    expect(await cardsVersion(USER, mine)).toBeNull();
    expect(direct.directCardsVersion).toHaveBeenCalledWith(USER);
    expect(postgres.cardsVersion).not.toHaveBeenCalled();
  });

  it("never goes direct for the anonymous fallback", async () => {
    direct.directCardsVersion.mockResolvedValue(9);
    expect(await cardsVersion(USER)).toBe(5);
    expect(direct.directCardsVersion).not.toHaveBeenCalled();
    expect(postgres.cardsVersion).toHaveBeenCalledWith(anon, USER);
  });
});

describe("latestUsdEurRate", () => {
  it("asks the gateway where there is no direct answer", async () => {
    direct.directLatestUsdEurRate.mockResolvedValue(undefined);
    expect(await latestUsdEurRate(mine)).toEqual({ day: "2026-09-18", rate: 0.85 });
    expect(postgres.readLatestUsdEurRate).toHaveBeenCalledWith(mine);
  });

  it("takes the direct answer and does not ask the gateway", async () => {
    direct.directLatestUsdEurRate.mockResolvedValue({ day: "2026-09-18", rate: 0.9 });
    expect(await latestUsdEurRate(mine)).toEqual({ day: "2026-09-18", rate: 0.9 });
    expect(postgres.readLatestUsdEurRate).not.toHaveBeenCalled();
  });
});

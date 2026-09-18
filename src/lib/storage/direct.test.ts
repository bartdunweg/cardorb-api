import { X509Certificate } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The direct connection with and without DATABASE_POOLER_URL. Unset, `pg` is never loaded and
 * every answer is "ask the gateway" (undefined); set, the one parameterised query runs on the
 * pool, and a failure goes back to the gateway and rests the connection for a minute.
 */
const query = vi.fn();
const poolsMade = vi.fn();
const attached = vi.fn();
const pgLoaded = vi.fn();

vi.mock("pg", () => {
  pgLoaded();
  class Pool {
    constructor(config: unknown) {
      poolsMade(config);
    }
    on() {}
    query = query;
  }
  return { Pool, default: { Pool } };
});
vi.mock("@vercel/functions/db-connections", () => ({ attachDatabasePool: attached }));

const URL_SET =
  "postgresql://cardorb_direct.abcdefghijklmnop:s3cret-pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
const USER = "00000000-0000-0000-0000-000000000001";

const load = async () => {
  vi.resetModules();
  return import("./direct");
};

beforeEach(() => {
  query.mockReset();
  poolsMade.mockReset();
  attached.mockReset();
  pgLoaded.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("without DATABASE_POOLER_URL", () => {
  it("answers undefined for both reads and never loads pg", async () => {
    vi.stubEnv("DATABASE_POOLER_URL", "");
    const direct = await load();
    expect(direct.directConfigured()).toBe(false);
    expect(await direct.directCardsVersion(USER)).toBeUndefined();
    expect(await direct.directLatestUsdEurRate()).toBeUndefined();
    expect(pgLoaded).not.toHaveBeenCalled();
    expect(poolsMade).not.toHaveBeenCalled();
  });
});

describe("with DATABASE_POOLER_URL", () => {
  beforeEach(() => vi.stubEnv("DATABASE_POOLER_URL", URL_SET));

  it("reads the version with the id as a parameter, never in the text", async () => {
    query.mockResolvedValue({ rows: [{ cards_version: "41" }] });
    const direct = await load();
    expect(await direct.directCardsVersion(USER)).toBe(41);
    expect(query).toHaveBeenCalledWith({ text: direct.DIRECT_SQL.cardsVersion, values: [USER] });
    expect(direct.DIRECT_SQL.cardsVersion).not.toContain(USER);
  });

  it("answers null for a profile that is not there, as the gateway read does", async () => {
    query.mockResolvedValue({ rows: [] });
    const direct = await load();
    expect(await direct.directCardsVersion(USER)).toBeNull();
  });

  it("reads the dollar rate as a number with its day", async () => {
    query.mockResolvedValue({ rows: [{ day: "2026-09-18", rate: "0.8498" }] });
    const direct = await load();
    expect(await direct.directLatestUsdEurRate()).toEqual({ day: "2026-09-18", rate: 0.8498 });
  });

  it("makes one pool per instance and attaches it for Fluid Compute", async () => {
    query.mockResolvedValue({ rows: [{ cards_version: 1 }] });
    const direct = await load();
    await Promise.all([direct.directCardsVersion(USER), direct.directCardsVersion(USER)]);
    await direct.directLatestUsdEurRate();
    expect(poolsMade).toHaveBeenCalledTimes(1);
    expect(attached).toHaveBeenCalledTimes(1);
  });

  it("goes back to the gateway on a failure and rests the connection for a minute", async () => {
    query.mockRejectedValueOnce(new Error("connection timeout"));
    const direct = await load();
    expect(await direct.directCardsVersion(USER)).toBeUndefined();
    query.mockResolvedValue({ rows: [{ cards_version: 2 }] });
    expect(await direct.directCardsVersion(USER)).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
    // The log names the read, never the connection string.
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("cardsVersion");
    expect(logged).not.toContain("s3cret-pw");
  });

  it("asks again once the minute is over", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      query.mockRejectedValueOnce(new Error("down"));
      const direct = await load();
      await direct.directCardsVersion(USER);
      vi.setSystemTime(Date.now() + 61_000);
      query.mockResolvedValue({ rows: [{ cards_version: 3 }] });
      expect(await direct.directCardsVersion(USER)).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("poolConfig", () => {
  it("verifies the pooler against Supabase's root and ignores sslmode in the string", async () => {
    const { poolConfig } = await load();
    const config = poolConfig(`${URL_SET}?sslmode=disable`);
    expect(config).not.toHaveProperty("connectionString");
    const ssl = config.ssl as { ca: string; rejectUnauthorized: boolean; servername: string };
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.servername).toBe("aws-0-eu-west-1.pooler.supabase.com");
    expect(new X509Certificate(ssl.ca).subject).toContain("CN=Supabase Root 2021 CA");
    expect(config).toMatchObject({
      host: "aws-0-eu-west-1.pooler.supabase.com",
      port: 6543,
      user: "cardorb_direct.abcdefghijklmnop",
      password: "s3cret-pw",
      database: "postgres",
      max: 3,
      idleTimeoutMillis: 5_000,
    });
  });

  it("refuses a string that is not a postgres URL", async () => {
    const { poolConfig } = await load();
    expect(() => poolConfig("https://example.com")).toThrow(/postgres/);
  });
});

describe("the root certificate", () => {
  it("is the one checked on 2026-09-18 and still valid", async () => {
    const { SUPABASE_ROOT_2021_CA } = await import("./direct-root-ca");
    const cert = new X509Certificate(SUPABASE_ROOT_2021_CA.trim());
    expect(cert.fingerprint256).toBe(
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
    );
    expect(cert.ca).toBe(true);
    // A failing line here is a reminder with years to spare, not an outage.
    expect(new Date(cert.validTo).getTime()).toBeGreaterThan(Date.now() + 90 * 86_400_000);
  });
});

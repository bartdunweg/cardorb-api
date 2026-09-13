import { describe, expect, it } from "vitest";
import { HISTORY_DAILY_FROM, needsHistoryRebuild } from "./value-history";

describe("needsHistoryRebuild", () => {
  const acquired = (d: string | null) => ({ owned: true, acquiredAt: d });

  // Since 2026-09-13 a built history is every day from 2024-02-08, weekdays included: a weekday
  // is no longer the mark of the old series, and a nightly rebuild would not fit in the cron.
  it("leaves a built account alone, whatever days its history has", () => {
    expect(
      needsHistoryRebuild(
        ["2024-02-08", "2024-02-09", "2026-08-17", "2026-08-18"],
        [acquired("2023-09-01T00:00:00Z")],
      ),
    ).toBe(false);
    expect(
      needsHistoryRebuild(["2024-12-30", "2026-08-16"], [acquired("2023-09-01T00:00:00Z")]),
    ).toBe(false);
  });

  it("rebuilds an account with copies from before the nightly series and no history there yet", () => {
    expect(needsHistoryRebuild(["2026-09-09"], [acquired("2025-01-01T00:00:00Z")])).toBe(true);
    expect(needsHistoryRebuild([], [acquired(null)])).toBe(true);
  });

  it("does nothing for an account that started after the nightly series did", () => {
    expect(needsHistoryRebuild(["2026-09-09"], [acquired("2026-09-09T12:00:00Z")])).toBe(false);
    expect(HISTORY_DAILY_FROM).toBe("2026-08-16");
  });
});

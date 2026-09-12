import { describe, expect, it } from "vitest";
import { HISTORY_DAILY_FROM, needsHistoryRebuild, saturdaysBetween } from "./value-history";

describe("saturdaysBetween", () => {
  it("lists every Saturday from the first one on or after `from`, up to but not including `before`", () => {
    expect(saturdaysBetween("2024-02-08", "2024-02-25")).toEqual([
      "2024-02-10",
      "2024-02-17",
      "2024-02-24",
    ]);
    expect(saturdaysBetween("2024-02-10", "2024-02-10")).toEqual([]);
  });
});

describe("needsHistoryRebuild", () => {
  const acquired = (d: string | null) => ({ owned: true, acquiredAt: d });

  // Bart's account before the rebuild: a 2024-12-30 Monday and a 2026-06-17 Wednesday, the old
  // archived captures, then nightly points. The rebuilt history before the nightly series is
  // Saturdays only, so a weekday there means it has not been rebuilt.
  it("rebuilds an account whose history before the nightly series has a weekday in it", () => {
    expect(
      needsHistoryRebuild(
        ["2024-12-30", "2026-06-17", "2026-08-16"],
        [acquired("2023-09-01T00:00:00Z")],
      ),
    ).toBe(true);
  });

  it("leaves a rebuilt account alone: Saturdays before the nightly series, anything after", () => {
    expect(
      needsHistoryRebuild(
        ["2024-02-10", "2024-02-17", "2026-08-17", "2026-08-18"],
        [acquired("2023-09-01T00:00:00Z")],
      ),
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

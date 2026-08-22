// @vitest-environment jsdom

/**
 * The name field's state machine, and the race it was written to survive.
 *
 * Two things here cannot be reached without running the hook: the 350ms
 * debounce, which is what keeps the endpoint's sixty-a-minute limit honest,
 * and the stale-answer guard, whose whole point is that a slow "taken" landing
 * after the name was corrected must not overwrite the newer state. The source
 * says both are deliberate; this is what makes that claim checkable.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsernameCheck, usernameSays } from "./useUsernameCheck";

/** Resolves when the test says so, so two answers can be landed out of order. */
function deferred<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

const answer = (available: boolean, reason?: string) =>
  ({ ok: true, json: async () => ({ available, reason }) }) as unknown as Response;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useUsernameCheck", () => {
  it("says nothing about the name you already have", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useUsernameCheck("Bart", "bart"));
    expect(result.current).toEqual({ kind: "idle" });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // Not even asked: the name is unchanged.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a badly shaped name before asking anyone", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useUsernameCheck("a", "bart"));
    expect(result.current.kind).toBe("taken");
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("waits out the pause in typing before asking once", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(answer(true));
    const { result, rerender } = renderHook(({ typed }) => useUsernameCheck(typed, "bart"), {
      initialProps: { typed: "nova" },
    });

    expect(result.current).toEqual({ kind: "checking" });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    // Another keystroke inside the window restarts it rather than adding a
    // second request.
    rerender({ typed: "novax" });
    await act(async () => {
      vi.advanceTimersByTime(349);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/v1/usernames/novax");
    await waitFor(() => expect(result.current).toEqual({ kind: "free" }));
  });

  it("reports the reason the server gave for refusing a name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(answer(false, "That one is reserved."));
    const { result } = renderHook(() => useUsernameCheck("admin2", "bart"));
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await waitFor(() =>
      expect(result.current).toEqual({ kind: "taken", reason: "That one is reserved." }),
    );
  });

  it("drops an answer about a name that is no longer typed", async () => {
    const slow = deferred<Response>();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(async () => answer(true));

    const { result, rerender } = renderHook(({ typed }) => useUsernameCheck(typed, "bart"), {
      initialProps: { typed: "taken-name" },
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // The name is corrected while the first answer is still in flight.
    rerender({ typed: "free-name" });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    // Now the stale "taken" lands, after the newer request went out.
    await act(async () => {
      slow.settle(answer(false, "Already claimed."));
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current).toEqual({ kind: "free" }));
  });

  it("does not call a name taken because the check itself failed", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useUsernameCheck("nova", "bart"));
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    // Still checking, never "taken" — claiming it is what decides.
    await waitFor(() => expect(result.current).toEqual({ kind: "checking" }));
  });
});

describe("usernameSays", () => {
  it("stays quiet while there is nothing to say", () => {
    expect(usernameSays({ kind: "idle" }, "nova")).toBeNull();
  });

  it("names the name it is talking about", () => {
    expect(usernameSays({ kind: "free" }, "nova")).toBe("nova is free.");
  });

  it("passes the refusal through unchanged", () => {
    expect(usernameSays({ kind: "taken", reason: "Too short." }, "n")).toBe("Too short.");
  });
});

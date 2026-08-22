// @vitest-environment jsdom

/**
 * The half of Modal that has never had a test.
 *
 * The file this covers used to be 404 lines of our own, and the only test over
 * any of it checked two pure predicates. The scroll lock, `inert`, Escape, the
 * backdrop click, where focus goes and where it comes back to — none of it was
 * tested at any level, and neither were the two sheets. That was survivable
 * while the file was not moving. It was not survivable while it was being
 * replaced by React Aria, so this was written first, against the hand-rolled
 * version, and run green before the swap.
 *
 * **Four of these cases changed when the swap landed, and each is a real
 * behaviour change rather than a test bent to fit.** They are marked CHANGED
 * with what it was and what it is. Everything else passed before and after,
 * unedited — which is the whole point of having written them in that order.
 *
 * Three things jsdom does not do, stubbed in beforeEach rather than worked
 * around in the assertions:
 *
 * - **Layout.** `getClientRects()` returns nothing for every element. Stubbed to
 *   report one rect, and none for an element hidden with `display: none`.
 * - **`matchMedia`.** Absent entirely.
 * - **`scrollTo`.** Throws "not implemented". Recorded instead.
 *
 * And one it does not do that is load-bearing: `Element.getAnimations`. React
 * Aria uses it to decide an exit animation has finished, so in jsdom the exit
 * never resolves on its own and Modal's fallback timer is what closes the
 * dialog. That the timer is exercised on every close here is deliberate — it is
 * the path nothing else would ever run.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Modal from "./Modal";

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  HTMLElement.prototype.getClientRects = function getClientRects(this: HTMLElement) {
    const hidden = this.style.display === "none";
    return (hidden ? [] : [{ width: 10, height: 10 }]) as unknown as DOMRectList;
  };
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  setReducedMotion(true);
});

afterEach(() => {
  // The exit-animation test replaces this; jsdom has no animations of its own,
  // so returning none is both the default and the honest reset.
  Element.prototype.getAnimations = function getAnimations() {
    return [] as unknown as Animation[];
  };
  delete (globalThis as { CSSTransition?: unknown }).CSSTransition;
  // Vitest runs without globals, so Testing Library's own auto-cleanup never
  // registers: without this every render leaks into the next test.
  cleanup();
  document.body.style.cssText = "";
  document.documentElement.style.cssText = "";
});

/** A trigger outside the dialog, so focus has somewhere real to return to. */
function Harness({ open, onClose = () => {} }: { open: boolean; onClose?: () => void }) {
  return (
    <div>
      <button type="button" data-testid="opener">
        Open
      </button>
      <Modal open={open} onClose={onClose} label="Test dialog">
        <button type="button" data-testid="first">
          First
        </button>
        <input data-testid="field" defaultValue="" />
      </Modal>
    </div>
  );
}

/** The visible panel, which is the box every caller styles. */
const panel = () => document.querySelector(".modal") as HTMLElement;

/** Longer than Modal's 250ms fallback, so "did not happen" means it. */
const past = () => new Promise((r) => setTimeout(r, 340));

describe("the dialog itself", () => {
  it("renders nothing at all when closed", () => {
    render(<Harness open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a dialog with the label it was given", () => {
    render(<Harness open />);
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeTruthy();
  });

  it("portals out of where it was written", () => {
    const { container } = render(<Harness open />);
    expect(container.querySelector("[role='dialog']")).toBeNull();
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
  });

  /**
   * These class names are a contract, not decoration: cardModalClasses.ts and
   * Sheet.tsx reach into this markup with `[&_.modal-scroll]:` arbitrary
   * variants, because Modal owns those elements and takes no className for them.
   * Losing one is silent — the rule simply stops matching.
   */
  it("keeps the class hooks the callers style from outside", () => {
    render(<Harness open />);
    expect(panel()).not.toBeNull();
    expect(panel().querySelector(".modal-scroll")).not.toBeNull();
    expect(panel().querySelector(".modal-close")).not.toBeNull();
    expect(panel().contains(screen.getByTestId("first"))).toBe(true);
  });
});

describe("closing", () => {
  it("Escape closes it", async () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("Escape twice inside one exit still closes once", async () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await past();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // userEvent, not fireEvent, for the two pointer cases. React Aria decides
  // "outside" from a pointerdown/pointerup pair it tracks itself, and a lone
  // synthetic mousedown is not that pair — it reports no interaction at all,
  // which reads exactly like a backdrop that does not close.
  it("a click on the backdrop closes it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    await user.click(panel().parentElement as HTMLElement);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("a click inside the panel does not", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    await user.click(screen.getByTestId("first"));
    await past();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the close button closes it", async () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    const close = panel().querySelector(".modal-close") as HTMLElement;
    fireEvent.click(close);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  /**
   * The contract CardModal leans on: it calls router.back() in onClose, so a
   * close that fires at the *start* of the exit unmounts the route
   * mid-animation and the card vanishes rather than leaving.
   *
   * Only half of it can be checked here. jsdom has no `Element.getAnimations`,
   * so React Aria finds no exit animation to wait for and tears down at once —
   * there is no "during the exit" in this environment to observe. What is
   * checked here is that the close still arrives, exactly once, through that
   * path. **The timing half is in visual/owner.spec.ts**, which presses Escape
   * in a real browser and catches the panel still there and marked
   * `data-exiting` before it goes.
   */
  it("still closes exactly once with motion on", async () => {
    setReducedMotion(false);
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await past();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * CardModal's shape, and the one this file missed on the first pass.
   *
   * Its `open` is the literal `true` — the intercepting route's existence *is*
   * the open state — and its onClose is `router.back()`, a navigation rather
   * than a setState. So nothing flips `open` to false in the same React batch,
   * and a close that resets its own state leaves `open && !closing` true again:
   * the card re-mounts, plays its entrance, and only then does the route go.
   *
   * The five other call sites all close themselves with a setState and batch
   * their way past it, which is exactly why reading the code was the only thing
   * that was going to find this.
   */
  it("stays closed when the consumer holds open at true", async () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    // Past the fallback timer, and past any re-entry it could cause.
    await past();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opens again after a close the user asked for", async () => {
    // The other half of the rule above: `closing` is cleared by a change of
    // `open`. Clear it too eagerly and the card flashes back; never clear it and
    // the dialog opens exactly once per mount.
    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    rerender(<Harness open={false} onClose={onClose} />);
    await past();
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(<Harness open onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  /**
   * The contract itself, not just its outcome — and the one the sign-off check
   * proved nothing guarded: moving `onClose` to the *start* of the exit left all
   * 518 tests green.
   *
   * It is testable here after all. React Aria decides an exit is over with
   * `Promise.all(element.getAnimations().map((a) => a.finished))`, and jsdom
   * implements no animations at all, so that promise resolves at once and there
   * is no "during the exit" to observe. Handing it one animation whose `finished`
   * this test controls puts the moment back.
   *
   * The assertion is deliberately synchronous: whatever else happens later, at
   * the instant the close is asked for the dialog must still be on screen and the
   * consumer must not yet have been told. CardModal navigates in `onClose`.
   */
  it("has not told the consumer while the exit is still running", async () => {
    setReducedMotion(false);
    let finishExit = () => {};
    const finished = new Promise<void>((resolve) => {
      finishExit = resolve;
    });
    // React Aria cancels anything that is a `CSSTransition` before waiting on
    // the rest. jsdom defines no such class, and `instanceof` against an
    // undefined global throws — so it is declared here, and the fake animation
    // is deliberately not one of them.
    (globalThis as { CSSTransition?: unknown }).CSSTransition = class CSSTransition {};
    Element.prototype.getAnimations = function getAnimations() {
      return [{ finished, cancel() {} }] as unknown as Animation[];
    };

    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    // Mid-exit: still there, consumer not told.
    expect(panel()).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    finishExit();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("does not call onClose when the consumer is the one closing it", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} />);
    rerender(<Harness open={false} onClose={onClose} />);
    await past();
    // The consumer already knows: it set open={false} itself. Calling back would
    // be a second close for one closing, and CardModal would navigate twice.
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("focus", () => {
  /**
   * CHANGED. Was: focus lands on the first focusable control, chosen by the
   * hand-rolled selector. Now: React Aria moves focus to the dialog itself,
   * which is its standard behaviour and is exactly why that selector — the thing
   * that shipped a keyboard trap — no longer exists. Inside the dialog either
   * way, which is what actually matters.
   */
  it("moves into the dialog on open", () => {
    render(<Harness open />);
    const dialog = screen.getByRole("dialog");
    expect(dialog === document.activeElement || dialog.contains(document.activeElement)).toBe(true);
  });

  it("returns to whatever was focused when it closes", async () => {
    const { rerender } = render(<Harness open={false} />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    expect(document.activeElement).toBe(opener);

    rerender(<Harness open />);
    expect(document.activeElement).not.toBe(opener);

    rerender(<Harness open={false} />);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  /**
   * CHANGED, in mechanism only. Was: `inert` set by hand on every sibling of the
   * backdrop. Now: React Aria's, which picks its mechanism per environment — and
   * this test only ever sees the weaker one. In a real browser it sets `inert`
   * (measured on the public profile page: 9 of the 10 body children inert while
   * a card dialog is up, the tenth being the overlay). jsdom does not implement
   * `inert`, so React Aria falls back to `aria-hidden`, which is what is
   * asserted below.
   *
   * Do not read this row as proof that `inert` is applied — it is proof that the
   * page behind is hidden by *something*, in the environment this test runs in.
   * React Aria also sets no `aria-modal` at all, deliberately: hiding the
   * siblings outright has better screen-reader support than announcing modality.
   *
   * The assertion is the same one either way: while a dialog is up, the page
   * behind it is not there as far as assistive technology is concerned.
   */
  it("hides the rest of the page from assistive tech, and puts it back", async () => {
    const { rerender } = render(<Harness open={false} />);
    const outside = document.createElement("div");
    document.body.appendChild(outside);

    rerender(<Harness open />);
    await waitFor(() => expect(outside.getAttribute("aria-hidden")).toBe("true"));

    rerender(<Harness open={false} />);
    await waitFor(() => expect(outside.getAttribute("aria-hidden")).toBeNull());
    outside.remove();
  });
});

/**
 * CHANGED, in mechanism. Was: the body pinned `position: fixed` at its own
 * negative scroll offset, with `window.scrollTo` handing the page back on close
 * — written that way because `overflow: hidden` alone had been measured to clamp
 * the scroll position to zero and snap the page to the top.
 *
 * Now: React Aria's own lock, `overflow: hidden` plus `scrollbar-gutter: stable`
 * on the root element. That is a different bet on the same problem and jsdom
 * cannot referee it — there is no layout here to snap. **The case that decides
 * it is in visual/owner.spec.ts**, which opens a card from halfway down /cards
 * in a real browser and asserts the page did not move. This block holds only
 * what jsdom can still see.
 */
describe("the scroll lock", () => {
  it("stops the page scrolling while it is up", () => {
    render(<Harness open />);
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("publishes --lock-vw so a fixed bar keeps its width", () => {
    render(<Harness open />);
    expect(document.documentElement.style.getPropertyValue("--lock-vw")).toBe(
      `${window.innerWidth}px`,
    );
  });

  it("hands the page back on close", async () => {
    const { rerender } = render(<Harness open />);
    rerender(<Harness open={false} />);

    await waitFor(() => expect(document.documentElement.style.overflow).toBe(""));
    expect(document.documentElement.style.getPropertyValue("--lock-vw")).toBe("");
  });

  it("does not leave the page locked when it unmounts while still open", async () => {
    const { unmount } = render(<Harness open />);
    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount();
    await waitFor(() => expect(document.documentElement.style.overflow).toBe(""));
    expect(document.documentElement.style.getPropertyValue("--lock-vw")).toBe("");
  });
});

// @vitest-environment jsdom

/**
 * Sheet, which had no test of any kind at any viewport.
 *
 * It composes Modal, so most of what matters to it is covered by
 * Modal.dom.test.tsx. What is covered *here* is the part Sheet adds and the
 * part that is easy to lose in a rewrite: the three regions (head, scrolling
 * body, foot), the title being a real heading rather than only an aria-label,
 * and the class hooks that FilterSheet, ViewSheet and cardModalClasses.ts drive
 * from outside.
 *
 * What this deliberately cannot cover: `[&_.modal-close]:hidden`. jsdom applies
 * no stylesheet, so the close button is visible here and the historical
 * keyboard trap cannot be reproduced at this level. That case lives in
 * visual/owner.spec.ts at 390px, where there is a real browser with real CSS.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

beforeEach(() => {
  HTMLElement.prototype.getClientRects = function getClientRects(this: HTMLElement) {
    const hidden = this.style.display === "none";
    return (hidden ? [] : [{ width: 10, height: 10 }]) as unknown as DOMRectList;
  };
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  // A phone. Modal reads this at open time to decide which way the panel comes in.
  Object.defineProperty(window, "innerWidth", { value: 390, configurable: true, writable: true });
});

afterEach(() => {
  cleanup();
  document.body.style.cssText = "";
  document.documentElement.style.cssText = "";
});

function open(onClose = () => {}) {
  return render(
    <Sheet
      open
      onClose={onClose}
      label="Filter the collection"
      title="Filter"
      headExtra={
        <button type="button" data-testid="clear">
          Clear all
        </button>
      }
      footer={
        <button type="button" data-testid="apply">
          Apply
        </button>
      }
    >
      <button type="button" data-testid="facet">
        Rarity
      </button>
    </Sheet>,
  );
}

describe("Sheet", () => {
  it("is a dialog named by its label, not by its title", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Filter the collection" })).toBeTruthy();
  });

  it("draws the title as a real heading as well", () => {
    open();
    expect(screen.getByRole("heading", { name: "Filter", level: 2 })).toBeTruthy();
  });

  it("puts headExtra in the head and the footer below the scroller", () => {
    open();
    const body = (document.querySelector(".modal") as HTMLElement).querySelector(
      ".sheet-body",
    ) as HTMLElement;
    const clear = screen.getByTestId("clear");
    const apply = screen.getByTestId("apply");

    expect(body.contains(clear)).toBe(false);
    expect(body.contains(apply)).toBe(false);
    expect(body.contains(screen.getByTestId("facet"))).toBe(true);
    // The foot has to follow the scroller in the DOM, or a thumb has to scroll
    // six hundred Pokémon to reach Apply.
    expect(body.compareDocumentPosition(apply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /**
   * These class names are a contract, not decoration: FilterSheet, ViewSheet and
   * cardModalClasses.ts all reach in with `[&_.modal-scroll]:` arbitrary
   * variants. Losing one is silent — the rule simply stops matching.
   */
  it("keeps the class hooks the callers style from outside", () => {
    open();
    // The panel and the labelled dialog are two elements now: Untitled UI's
    // Modal is the surface the classes land on, its Dialog is the content region
    // React Aria names. The descendant variants the callers write reach the same
    // markup either way, which is why nothing outside had to change.
    const panel = document.querySelector(".modal") as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.classList.contains("modal--sheet")).toBe(true);
    expect(panel.querySelector(".modal-scroll")).not.toBeNull();
    expect(panel.querySelector(".modal-close")).not.toBeNull();
    expect(panel.querySelector(".sheet")).not.toBeNull();
    expect(panel.querySelector(".sheet-body")).not.toBeNull();
    expect(panel.contains(screen.getByRole("dialog"))).toBe(true);
  });

  it("Escape closes it", async () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("locks the page while it is up", () => {
    open();
    // React Aria's lock now, on the root element, rather than the body pinning
    // Modal used to do by hand. See Modal.dom.test.tsx for what that change is
    // and where the case that decides it lives.
    expect(document.documentElement.style.overflow).toBe("hidden");
  });
});

// @vitest-environment jsdom

/**
 * The arrow keys, and the one case that makes them a hazard.
 *
 * The listener is on `document`, so it is live on every page a card can be
 * open over — including the two with a text field in them. Typing "Charizard"
 * into the add form contains no arrow key, but moving the caret does, and
 * without the guard that would navigate away mid-sentence. There is no way to
 * assert that without a real focused input, which is why this is a DOM test
 * rather than a pure one.
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardNav from "./CardNav";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockClear();
});

afterEach(cleanup);

const arrow = (key: "ArrowLeft" | "ArrowRight") => fireEvent.keyDown(document, { key });

describe("CardNav", () => {
  it("walks to the card either side, and does not scroll the page under it", () => {
    render(<CardNav prev="sv03-124" next="sv03-126" />);
    arrow("ArrowLeft");
    expect(push).toHaveBeenCalledWith("/cards/sv03-124", { scroll: false });
    arrow("ArrowRight");
    expect(push).toHaveBeenCalledWith("/cards/sv03-126", { scroll: false });
  });

  it("stays inside the route it was given", () => {
    render(<CardNav prev="sv03-124" next={null} basePath="/collection/card" />);
    arrow("ArrowLeft");
    expect(push).toHaveBeenCalledWith("/collection/card/sv03-124", { scroll: false });
  });

  it("goes nowhere at either end of the collection", () => {
    render(<CardNav prev={null} next={null} />);
    arrow("ArrowLeft");
    arrow("ArrowRight");
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps out of the way while something is being typed into", () => {
    render(<CardNav prev="sv03-124" next="sv03-126" />);

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    arrow("ArrowLeft");
    expect(push).not.toHaveBeenCalled();

    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    textarea.focus();
    arrow("ArrowRight");
    expect(push).not.toHaveBeenCalled();

    // And picks the keys back up the moment the field is left.
    textarea.blur();
    input.remove();
    textarea.remove();
    arrow("ArrowRight");
    expect(push).toHaveBeenCalledWith("/cards/sv03-126", { scroll: false });
  });

  it("stops listening once it is gone", () => {
    const { unmount } = render(<CardNav prev="sv03-124" next="sv03-126" />);
    unmount();
    arrow("ArrowLeft");
    expect(push).not.toHaveBeenCalled();
  });
});

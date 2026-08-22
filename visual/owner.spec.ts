import { expect, test } from "@playwright/test";
import { expectOneMainLandmark } from "./landmark";

/**
 * The signed-in screens — the ones the four failures actually happened on.
 *
 * ADR-0051 shipped without these and said so: `/collection`, `/dashboard` and
 * the add-card dialog need a login, and ADR-0020 is precisely a bug that hid
 * behind one, a dialog's inputs silently losing their glass styling on a route
 * nobody could photograph. visual/auth.setup.ts closes that by minting a session
 * for the owner account, so the remaining cards.css classes — cards-rail,
 * cards-nav, cards-nav-item, cards-main, cards-head, cards-search, filter-menu —
 * can be moved against evidence rather than hope.
 *
 * The add-card dialog is opened rather than merely visited, because its styling
 * is the thing ADR-0020 was about and a closed dialog photographs nothing.
 */

const WIDTHS = [
  { name: "narrow", width: 390, height: 900 },
  { name: "middle", width: 800, height: 1000 },
  { name: "wide", width: 1280, height: 1000 },
];

const PAGES = [
  // The rail, the bar, the toolbar, the grid — most of what is left.
  { name: "collection", path: "/collection" },
  // Different chrome: the tiles, the charts, the movers list.
  { name: "dashboard", path: "/dashboard" },
  { name: "wishlist", path: "/wishlist" },
  { name: "settings", path: "/settings" },
];

async function settle(p: import("@playwright/test").Page) {
  // Only what is on screen, for the reason spelled out in cards-css.spec.ts:
  // sixteen hundred lazy images below the fold never complete.
  await p.waitForFunction(
    () =>
      Array.from(document.images)
        .filter((i) => {
          const r = i.getBoundingClientRect();
          return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
        })
        .every((i) => i.complete),
    undefined,
    { timeout: 30_000 },
  );
}

for (const page of PAGES) {
  for (const size of WIDTHS) {
    test(`${page.name} @ ${size.name}`, async ({ page: p }) => {
      await p.setViewportSize({ width: size.width, height: size.height });
      await p.goto(page.path, { waitUntil: "networkidle" });
      // A redirect to /login means the session did not survive, and every
      // screenshot after it would be of the wrong page passing quietly.
      await expect(p).not.toHaveURL(/\/login/);
      await settle(p);

      // Nothing to do with the picture: the landmark and the skip link have no
      // appearance, so this is the only place they can be checked at all.
      await expectOneMainLandmark(p, `${page.name} @ ${size.name}`);

      await expect(p).toHaveScreenshot(`${page.name}-${size.name}.png`, {
        fullPage: false,
        /**
         * Prices and the value figures move nightly without anybody editing
         * code — the tiles, the chart, the movers list and every card's price.
         * Masked so a baseline keeps meaning something tomorrow; where they sit
         * is still compared, only what they say is not.
         */
        /* Prices only. `svg` was in this list and it masked every icon on the
           page as well as the value chart — which is why the rail's icons have
           been magenta blocks in every baseline, and why nobody could have seen
           the chart change. It was there because the chart used to be drawn as
           an <svg> full of live figures; the figures are a hover tooltip now and
           the line comes from stored snapshots, so it is stable and worth
           looking at.

           The two that stay are genuinely live: the collection-value tile and
           the priciest-cards table both read Cardmarket, which republishes
           nightly. */
        mask: [
          p.locator("[data-price], .cards-card-price, .card-price"),
          p.locator(".cards-dash-kpi-value, .cards-dash-table"),
        ],
      });
    });
  }
}

test("the add-card dialog, open", async ({ page: p }) => {
  // ADR-0020's exact hiding place: this dialog's inputs had lost their styling
  // and it went unnoticed because the route needs a session.
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.goto("/collection?add=1", { waitUntil: "networkidle" });
  await expect(p).not.toHaveURL(/\/login/);
  const dialog = p.locator("dialog[open], [role='dialog']").first();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await settle(p);
  await expect(p).toHaveScreenshot("add-dialog-wide.png", { fullPage: false });
});

test("the view menu, open", async ({ page: p }) => {
  /**
   * The dropdown behind the View button, which nothing photographed until its
   * checkboxes stopped being styled by cards.css — and a closed panel diffs
   * identical however wrong the thing inside it is.
   *
   * Same shape as the add-card dialog above and the same lesson (ADR-0020): a
   * control that needs a session *and* a click is two doors away from any
   * check, and this project has already shipped a styling regression through
   * exactly that gap.
   *
   * The filter rows used to be the gap named here: "neither would open
   * reliably from a click", so FilterOptions was converted and unphotographed.
   * Both menus are a real `<button>` opening a real `role="dialog"` now
   * (MenuPopover), so both open by accessible name and the filter panel has
   * its own shot below.
   */
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.goto("/collection", { waitUntil: "networkidle" });
  await expect(p).not.toHaveURL(/\/login/);

  await p.getByRole("button", { name: "View" }).first().click();
  await expect(p.getByRole("dialog", { name: "View options" })).toBeVisible({
    timeout: 10_000,
  });
  await settle(p);

  await expect(p).toHaveScreenshot("view-menu-wide.png", { fullPage: false });
});

test("the filter menu, open", async ({ page: p }) => {
  /**
   * The other half of the same gap. FilterOptions draws the inline segmented
   * rows and the facet list, and until this menu became a dialog nothing here
   * could open it.
   */
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.goto("/collection", { waitUntil: "networkidle" });
  await expect(p).not.toHaveURL(/\/login/);

  await p.getByRole("button", { name: "Filter" }).first().click();
  await expect(p.getByRole("dialog", { name: "Filter the collection" })).toBeVisible({
    timeout: 10_000,
  });
  await settle(p);

  await expect(p).toHaveScreenshot("filter-menu-wide.png", { fullPage: false });
});

test("the filter sheet on a phone, and its keyboard", async ({ page: p }) => {
  /**
   * The viewport that shipped the keyboard trap, and the one nothing has ever
   * opened. Below 1000px the Filter button opens `Sheet`, not the menu above —
   * a different component, with `[&_.modal-close]:hidden` on it. That hidden
   * close button was the old focus trap's first candidate: focusing it did
   * nothing, `inert` had already thrown focus to <body>, and every Tab escaped.
   *
   * jsdom cannot reproduce that, because it applies no stylesheet and the
   * button is therefore visible there. This is the only place in the suite with
   * real CSS, so this is where the case has to live. It asserts behaviour, not
   * pixels: a screenshot diffs identical whether or not Tab works.
   */
  await p.setViewportSize({ width: 390, height: 900 });
  await p.goto("/collection", { waitUntil: "networkidle" });
  await expect(p).not.toHaveURL(/\/login/);

  await p.getByRole("button", { name: "Filter" }).first().click();
  const sheet = p.getByRole("dialog", { name: "Filter the collection" });
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await settle(p);

  // Measured against `.modal--sheet`, the panel, rather than the first
  // `[role=dialog]` on the page: the collection has other dialogs mounted, and
  // React Aria puts the role on a `display: contents` box inside the panel.
  const inSheet = () =>
    p.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      const panel = document.querySelector(".modal--sheet");
      return {
        inside: !!active && !!panel && panel.contains(active),
        onHiddenClose: !!active?.closest(".modal-close"),
        active: active ? `${active.tagName}.${active.className.split(" ")[0]}` : "none",
      };
    });

  // Focus went into the sheet, and not onto the close button that is not there.
  const landed = await inSheet();
  expect(landed.inside, `focus landed on ${landed.active}`).toBe(true);
  expect(landed.onHiddenClose).toBe(false);

  // Tab all the way round twice. Focus must never leave the sheet.
  for (let i = 0; i < 24; i++) {
    await p.keyboard.press("Tab");
    const still = await inSheet();
    expect(still.inside, `focus escaped the sheet on Tab ${i + 1}, to ${still.active}`).toBe(true);
  }

  await expect(p).toHaveScreenshot("filter-sheet-narrow.png", { fullPage: false });

  // The exit is allowed to happen. React Aria marks the panel `data-exiting`
  // and keeps it mounted until the animation finishes, and Modal only tells its
  // consumer the dialog closed once it has — CardModal calls router.back()
  // there, so an early signal tears the route down mid-animation. jsdom has no
  // animations to observe, which is why this half of that contract is here.
  await p.keyboard.press("Escape");
  const exiting = await p.evaluate(
    () => document.querySelector(".modal")?.hasAttribute("data-exiting") ?? false,
  );
  expect(exiting, "the sheet closed without playing its exit").toBe(true);
  await expect(sheet).toBeHidden({ timeout: 10_000 });
});

test("a card opened from halfway down does not move the page", async ({ page: p }) => {
  /**
   * The one measurement the scroll lock exists for, and the one thing jsdom
   * cannot referee.
   *
   * Modal used to pin the body `position: fixed` at its own negative scroll
   * offset, because `overflow: hidden` alone had been measured here to clamp the
   * scroll position to zero: opening a card from halfway down /cards snapped
   * everything behind it to the top, and snapped back on close. React Aria's
   * lock is `overflow: hidden` plus `scrollbar-gutter: stable` on the root
   * element — a different bet on the same problem — so the swap to it is only
   * safe if this passes.
   */
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.goto("/collection", { waitUntil: "networkidle" });
  await expect(p).not.toHaveURL(/\/login/);
  await settle(p);

  await p.evaluate(() => window.scrollTo(0, 1200));
  await p.waitForFunction(() => window.scrollY > 600);
  const before = await p.evaluate(() => window.scrollY);

  await p.getByRole("button", { name: "Add a card" }).first().click();
  await expect(p.getByRole("dialog").first()).toBeVisible({ timeout: 10_000 });
  const during = await p.evaluate(() => window.scrollY);
  expect(during, `the page moved from ${before} to ${during} when the dialog opened`).toBe(before);

  await p.keyboard.press("Escape");
  await expect(p.getByRole("dialog").first()).toBeHidden({ timeout: 10_000 });
  const after = await p.evaluate(() => window.scrollY);
  expect(after, `the page moved from ${before} to ${after} when the dialog closed`).toBe(before);
});

test("a card can be reached and opened with a keyboard", async ({ page: p }) => {
  /**
   * The failure this exists for: every card in the grid was wrapped in an
   * element with `display: contents`, which has no layout box, and Chrome will
   * not focus one. Measured before the fix on /user/<name> — 1,609 of 1,609
   * focusable candidates in the grid reported zero client rects and none
   * accepted `.focus()`. The whole collection was unreachable by keyboard, which
   * is WCAG 2.1.1 at level A, and no test at any level said so.
   *
   * Asserted on the box rather than on the ring, because the box is the part
   * that decides whether focus can land at all.
   */
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.goto("/collection", { waitUntil: "networkidle" });
  await expect(p).not.toHaveURL(/\/login/);
  await settle(p);

  const measured = await p.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(".cards-item a[href], .cards-item button"),
    ).filter((el) => el.closest(".cards-item-tags") === null);
    const first = cards[0];
    first?.focus();
    return {
      count: cards.length,
      boxless: cards.filter((el) => el.getClientRects().length === 0).length,
      firstTakesFocus: !!first && document.activeElement === first,
    };
  });

  expect(measured.count, "no card links found — the selector has drifted").toBeGreaterThan(10);
  expect(measured.boxless, "cards with no layout box cannot be focused").toBe(0);
  expect(measured.firstTakesFocus, "the first card did not accept focus").toBe(true);
});

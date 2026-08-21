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

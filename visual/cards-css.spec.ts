import { expect, test } from "@playwright/test";
import { expectOneMainLandmark } from "./landmark";

/**
 * Every public surface that renders a rule from app/styles/cards.css.
 *
 * The list is derived rather than guessed: the 35 classes in that file are used
 * by CardsView.tsx, CardsSidebar.tsx, CardAddDialog.tsx and (app)/loading.tsx,
 * and of those the first two are reachable without a session through
 * /user/<name> — the public profile renders the same CardsView the signed-in
 * collection does, with `variant="public"`.
 *
 * ── The gap, stated plainly ────────────────────────────────────────────────
 *
 * `/collection`, `/dashboard` and the add-card dialog are **not covered**,
 * because they need a signed-in session and this harness has no credentials.
 * That is the standing verification gap STATE.md has recorded for weeks, and it
 * is exactly where ADR-0020 hid: a dialog's inputs had silently lost their
 * styling and nobody saw it because the route needs a login.
 *
 * So: this catches a regression on the public rendering of CardsView, which is
 * most of cards.css, and it catches nothing on the owner-only branches of the
 * same component. Do not read a green run as "the migration is safe" — read it
 * as "the public half did not move". Adding a storage state with a test
 * account's session is the one change that would close it.
 */

const WIDTHS = [
  // Below cards.css's 640px breakpoint.
  { name: "narrow", width: 390, height: 900 },
  // Between 641 and 1000 — the branch a migration is most likely to drop,
  // because it is the one nobody has open while they work.
  { name: "middle", width: 800, height: 1000 },
  // Above 1001.
  { name: "wide", width: 1280, height: 1000 },
];

/** A public profile exists at this name in production and locally. */
const OWNER = process.env.VISUAL_USERNAME ?? "bartdunweg";

/**
 * `fullPage` is per page and it is not a detail.
 *
 * The profile renders sixteen hundred cards with `loading="lazy"`, so a
 * full-page shot is both enormous and wrong: the images below the fold never
 * load unless something scrolls, and they would photograph as blank tiles that
 * differ run to run depending on how far the browser got. The viewport is also
 * where every class this harness exists for actually lives — cards-head,
 * cards-search, cards-count, cards-set-head, the first rows of cards-grid, and
 * the rail's cards-nav-item. Everything below is the same grid item repeating.
 *
 * The two marketing pages are short and have no lazy grid, so they get the lot.
 */
const PAGES = [
  { name: "profile", path: `/user/${OWNER}`, fullPage: false },
  { name: "landing", path: "/", fullPage: true },
  { name: "ios", path: "/app/ios", fullPage: true },
  /**
   * The Untitled UI proof screen (ADR-0056).
   *
   * Here rather than in owner.spec.ts on purpose: /login is the one screen
   * carrying converted controls that a signed-out browser can reach, and
   * ADR-0020 is a regression that hid for weeks behind a login. Short, no lazy
   * grid, so it gets the full page.
   *
   * A signed-in visitor is redirected straight through, which is why this only
   * works in the public project — the owner project would photograph /cards.
   */
  { name: "login", path: "/login", fullPage: true },
  /**
   * The rest of the door screens, added when the Untitled UI conversion moved
   * from /login to the whole FormField family. Both are public, so both can be
   * photographed; /settings/password is the fourth of the family and needs a
   * recovery session, so it has no entry here and is converted unphotographed.
   * That gap is named in ADR-0059 rather than left to be discovered.
   */
  { name: "signup", path: "/signup", fullPage: true },
  { name: "forgotten", path: "/password/forgotten", fullPage: true },
];

for (const page of PAGES) {
  for (const size of WIDTHS) {
    test(`${page.name} @ ${size.name}`, async ({ page: p }) => {
      await p.setViewportSize({ width: size.width, height: size.height });
      await p.goto(page.path, { waitUntil: "networkidle" });

      /**
       * Card scans come from two catalogues over the network and settle at
       * different times; a screenshot taken mid-load differs run to run for
       * reasons that have nothing to do with CSS.
       *
       * Only the images that are actually on screen, which is the correction
       * that made this work: `document.images.every(complete)` never becomes
       * true on the profile, because sixteen hundred lazy images below the fold
       * are waiting for a scroll that never comes. Waiting on them times out on
       * a page that is, visually, entirely ready.
       */
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

      // Nothing to do with the picture: the landmark and the skip link have no
      // appearance, so this is the only place they can be checked at all.
      await expectOneMainLandmark(p, `${page.name} @ ${size.name}`);

      await expect(p).toHaveScreenshot(`${page.name}-${size.name}.png`, {
        fullPage: page.fullPage,
        /**
         * Prices are the one thing on these pages that changes without anybody
         * editing code — Cardmarket republishes nightly. Masked so a baseline
         * taken this morning still means something this afternoon. Everything
         * about where the price sits is still compared; only the digits are not.
         */
        mask: [p.locator("[data-price], .cards-card-price, .card-price")],
      });
    });
  }
}

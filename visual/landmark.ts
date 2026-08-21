import { expect, type Page } from "@playwright/test";

/**
 * The rendered half of the skip link's guarantee.
 *
 * `app/main-landmark.test.ts` proves every screen has a *file* that claims to
 * draw a `<main id="main-content">`. It cannot prove the browser agrees, and
 * the bug this was written for was precisely about where an element ends up in
 * a rendered tree rather than what a file says: the landmark existed, in
 * `app/layout.tsx`, wrapped around navigation that a different file rendered
 * inside it.
 *
 * So this asserts the two things a static read cannot see — that exactly one
 * landmark comes out the other end, and that no navigation is inside it. Called
 * from both screenshot specs, so it covers ten real pages at three widths
 * without a spec of its own.
 *
 * Deliberately not a screenshot. Neither a landmark nor a skip link has any
 * appearance until the link is focused, which is why every picture this repo
 * has ever taken looked correct while the target was in the wrong place.
 */
export async function expectOneMainLandmark(p: Page, where: string) {
  await expect(
    p.locator("main#main-content"),
    `${where}: expected exactly one <main id="main-content">. None means "Skip ` +
      `to content" points at nothing; two is a duplicate id, and probably a ` +
      `nested <main>.`,
  ).toHaveCount(1);

  await expect(
    p.locator("main#main-content nav"),
    `${where}: found navigation inside the landmark. This is the bug the whole ` +
      `change was for — the skip link lands at the top of <main>, so anything ` +
      `navigational in there is something it failed to skip.`,
  ).toHaveCount(0);
}

import { defineConfig, devices } from "@playwright/test";

/**
 * Screenshots, for one job: making the Tailwind migration of cards.css safe.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * That migration has been attempted four times and gone wrong four times, and
 * every failure was invisible to the checks this project already runs. ADR-0012
 * is the clearest: a cascade-layers bug meant every Tailwind margin and padding
 * added since the migration began was silently losing to legacy CSS, and it went
 * unnoticed because `gap` was unaffected so the screenshots looked fine. ADR-0017,
 * ADR-0018 and ADR-0020 are three more of the same shape. Tests, typecheck and
 * lint pass through all of them: none of those tools can see a margin that
 * stopped applying.
 *
 * So before moving another rule out of cards.css, there has to be something that
 * can. That is all this is.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 *
 * It is deliberately **not** part of scripts/verify.sh and not a CI gate. The
 * pages it photographs render live prices from Cardmarket, which move every day,
 * so a committed baseline would be red by tomorrow morning through nothing
 * anyone did. Wiring that into the per-change gate would train everybody to
 * ignore it inside a week, which is worse than not having it.
 *
 * It is a tool you point at a change: take baselines, make the change, compare.
 * Baselines are gitignored for the same reason — they are a working artefact of
 * one migration sitting, not a fact about the project.
 *
 *   npm run visual:baseline    # before touching anything
 *   npm run visual             # after, to see what moved
 *
 * ── Widths ─────────────────────────────────────────────────────────────────
 *
 * Three, chosen to straddle the two breakpoints cards.css actually uses (640
 * and 1000) rather than to match any device: one below both, one between them,
 * one above. A migration that drops a media query is invisible at a width that
 * never triggered it.
 */
export default defineConfig({
  testDir: "./visual",
  // One at a time: these share a single dev server and screenshot comparison is
  // sensitive to the machine being busy.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  // No retries. A screenshot that passes on the second attempt is a screenshot
  // that cannot be trusted on the first, and the whole point here is trust.
  retries: 0,

  /**
   * Two projects: one signs in, the other uses what it saved. Split because the
   * sign-in mints a one-time link and must happen once per run, not once per
   * screenshot — and because a public-only run is still useful when the service
   * role key is not around.
   */
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "public",
      testMatch: /cards-css\.spec\.ts/,
    },
    {
      name: "owner",
      testMatch: /owner\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: "visual/.auth/owner.json" },
    },
  ],

  expect: {
    toHaveScreenshot: {
      /**
       * Room for antialiasing and nothing else.
       *
       * A dropped margin moves thousands of pixels; a font rendering a hair
       * differently moves a few dozen. 0.1% of a 1280×2000 page is ~2,500
       * pixels, which is under a single line of shifted text and far under any
       * layout change worth catching.
       */
      maxDiffPixelRatio: 0.001,
      // Transitions and the pane-in keyframe would otherwise be caught
      // mid-flight and differ every run.
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },

  use: {
    baseURL: process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:3210",
    ...devices["Desktop Chrome"],
    // Screenshots of a whole page, so a change below the fold still counts.
    screenshot: "off",
    trace: "off",
  },

  /**
   * A production build, not `next dev`. Dev mode injects overlays and does not
   * apply the same CSS pipeline, and this file exists precisely to catch a CSS
   * pipeline problem.
   */
  /**
   * ── When this flakes, and it does ──────────────────────────────────────────
   *
   * `npm run build && next start` inside a test runner is fragile here: the
   * build and the server contend for the same port with anything else the
   * session left running, and the failure arrives as twenty
   * ERR_CONNECTION_REFUSED, which reads like the app is broken rather than like
   * the server never came up.
   *
   * The escape hatch is the line below. Start the server yourself and point the
   * suite at it:
   *
   *   npm run build
   *   nohup npx next start -p 3213 >/tmp/s.log 2>&1 </dev/null & disown
   *   VISUAL_BASE_URL=http://127.0.0.1:3213 npm run visual
   *
   * The server has to outlive the shell that starts it, and on macOS neither
   * `&` nor `nohup ... & disown` is enough — there is no `setsid` either. What
   * works is starting it from something that is not a child of the test shell
   * at all. Symptom when it is wrong: the suite passes the public specs, then
   * every owner spec fails at once with ERR_CONNECTION_REFUSED.
   *
   * The heavy pages are why it shows up there and not earlier: /collection
   * renders 1,610 cards, so `NODE_OPTIONS=--max-old-space-size=4096` is worth
   * setting on the server too.
   *
   * `nohup ... & disown` and not a plain `&`: a backgrounded server still dies
   * with the shell that started it, and when it dies mid-run the suite does not
   * say so. It photographs the app's own error boundary — "This page couldn't
   * load" — and reports a 28% pixel difference, which reads exactly like a CSS
   * regression. Happened three times before the cause was found. If a diff looks
   * far too large, open it and check what is actually in the picture.
   *
   * Then `webServer` is undefined and Playwright touches nothing. Remember the
   * server serves the build that was on disk when it started — rebuild before
   * re-running, or the screenshots quietly check stale code.
   */
  webServer: process.env.VISUAL_BASE_URL
    ? undefined
    : {
        command: "npm run build && npx next start -p 3210",
        url: "http://127.0.0.1:3210/api/v1/health",
        reuseExistingServer: true,
        timeout: 240_000,
      },
});

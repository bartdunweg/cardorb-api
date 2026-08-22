import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Every screen renders exactly one `<main id="main-content">`, and it starts
 * after that screen's own navigation.
 *
 * Written because the previous arrangement was wrong in a way nothing could
 * see. `app/layout.tsx` held the app's only `<main id="main-content">`, wrapped
 * around `{children}` — and `AppShell` renders the rail and the tab bar inside
 * `{children}`. So "Skip to content" landed a keyboard user in front of the
 * entire sidebar and skipped nothing but the warning bar above it. It looked
 * right in every screenshot, because a skip link is invisible until it is
 * focused and a landmark has no appearance at all.
 *
 * Moving the landmark down to each screen fixes that and creates a new way to
 * be wrong: a route added later that forgets one, leaving the skip link
 * pointing at nothing. This test is the thing that notices. It is why the map
 * below is written out by hand rather than derived — an entry has to be added
 * deliberately, and adding it is the moment somebody decides where the
 * navigation on that screen ends.
 *
 * Static, for the reasons routes.test.ts gives: node environment, no server,
 * no jsdom. That is a real limit and it is why `visual/` also counts the
 * rendered landmark on ten real pages. This half proves every screen has a
 * file claiming to draw one; that half proves the browser agrees.
 */

const APP = "app";

/**
 * The URL paths that render a page. Route handlers are not screens.
 *
 * `/` is added by the caller rather than found here, for the same reason
 * routes.test.ts adds it: the walk only descends into directories, and
 * `app/page.tsx` is a file at the top.
 */
function pageRoutes(dir = APP, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) continue;
    // Interception markers — (.)cards, (..)foo — look like route groups and are
    // not: they re-render an existing route into a parallel slot. Card Orb's one
    // interception draws into @modal, which app/layout.tsx renders *beside* the
    // page and therefore outside the landmark. That is correct for a dialog, so
    // there is nothing here to check.
    if (/^\(\.+\)/.test(name)) continue;
    // Route groups — (app) — and parallel slots — @modal — are organisational
    // and contribute nothing to the URL.
    if (name.startsWith("(") || name.startsWith("@")) {
      out.push(...pageRoutes(path, prefix));
      continue;
    }
    if (name.startsWith("_")) continue;
    const segment = name.startsWith("[") ? ":param" : name;
    const here = `${prefix}/${segment}`;
    if (existsSync(join(path, "page.tsx"))) out.push(here);
    out.push(...pageRoutes(path, here));
  }
  return out;
}

/**
 * Which file draws the landmark for each screen.
 *
 * Mostly a shell rather than the page itself, which is the point: five door
 * screens share SigninShell, two legal pages share LegalPage, and every
 * signed-in route shares AppShell. One file per shell is also one place to get
 * the position right.
 */
const DRAWN_BY: Record<string, string> = {
  "/": "app/page.tsx",
  "/app/ios": "app/app/ios/page.tsx",
  "/brand": "app/brand/page.tsx",
  "/cards/:param": "app/cards/[id]/page.tsx",
  "/user/:param": "src/components/shared/CardsView.tsx",
  "/welcome": "app/welcome/page.tsx",

  // The five door screens, all through one shell.
  "/login": "src/components/shared/SigninShell.tsx",
  "/signup": "src/components/shared/SigninShell.tsx",
  "/password/forgotten": "src/components/shared/SigninShell.tsx",
  "/settings/password": "src/components/shared/SigninShell.tsx",

  // The two legal pages, likewise.
  "/privacy": "src/components/shared/LegalPage.tsx",
  "/terms": "src/components/shared/LegalPage.tsx",

  // Every signed-in route: AppShell's content pane is the landmark, and it has
  // to be that pane rather than the grid around it, because the rail and the
  // tab bar are its siblings.
  "/collection": "app/(app)/AppShell.tsx",
  "/collection/browse": "app/(app)/AppShell.tsx",
  "/collection/browse/:param": "app/(app)/AppShell.tsx",
  "/collection/card/:param": "app/(app)/AppShell.tsx",
  "/collection/era/:param": "app/(app)/AppShell.tsx",
  "/collection/set/:param": "app/(app)/AppShell.tsx",
  "/collection/sets": "app/(app)/AppShell.tsx",
  "/dashboard": "app/(app)/AppShell.tsx",
  "/settings": "app/(app)/AppShell.tsx",
  "/wishlist": "app/(app)/AppShell.tsx",
};

/**
 * Screens that deliberately draw no landmark, and why. A route belongs here
 * only if it renders nothing a person can be inside of.
 */
const NO_LANDMARK: Record<string, string> = {
  "/cards": "a redirect() to /collection — it renders nothing at all",
};

/** Files that draw one without being a route's own entry point. */
const ALSO_DRAWS: Record<string, string> = {
  "app/(app)/loading.tsx":
    "the Suspense fallback for every signed-in route: the skip link needs a " +
    "target while the collection is still loading, in the place it will be after",
};

/**
 * The source with its comments removed.
 *
 * Not fussiness: the first version of this test read `app/layout.tsx` raw and
 * failed, because the comment left there *explaining* that the landmark moved
 * out quotes `<main id="main-content">`. A test that cannot tell an element
 * from a sentence about one is a test that punishes writing the sentence.
 */
const code = (file: string) =>
  readFileSync(file, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // {/* JSX comment */}
    .replace(/\/\*[\s\S]*?\*\//g, "") // /* block */ and /** doc */
    .replace(/^\s*\/\/.*$/gm, ""); // // line

/**
 * Matched with a tolerant regex rather than a literal string, because prettier
 * breaks a `<main>` with two attributes across three lines and a literal match
 * silently stops finding it. The second thing this test got wrong about itself.
 */
const LANDMARK = /<main\b[^>]*\bid="main-content"/;

const has = (file: string) => LANDMARK.test(code(file));
const count = (file: string) => (code(file).match(new RegExp(LANDMARK, "g")) ?? []).length;

describe("the main landmark", () => {
  it("is not in the root layout, where it sat above every screen's navigation", () => {
    expect(
      has("app/layout.tsx"),
      "app/layout.tsx wraps {children}, and AppShell renders the sidebar and the " +
        "tab bar inside {children}. A landmark here contains the navigation the " +
        "skip link exists to skip. Put it in the shell that knows where the " +
        "navigation ends.",
    ).toBe(false);
  });

  it("every screen has a file that draws one", () => {
    const missing: string[] = [];
    for (const route of ["/", ...pageRoutes()]) {
      if (route in NO_LANDMARK) continue;
      const file = DRAWN_BY[route];
      if (!file) {
        missing.push(`${route} — no entry in DRAWN_BY`);
        continue;
      }
      if (!existsSync(file)) missing.push(`${route} — DRAWN_BY points at ${file}, which is gone`);
      else if (!has(file)) missing.push(`${route} — ${file} draws no <main id="main-content">`);
    }
    expect(
      missing,
      `A screen with no <main id="main-content"> leaves "Skip to content" ` +
        `pointing at nothing, which fails silently: the link is invisible until ` +
        `it is focused. Add the landmark after that screen's navigation, then ` +
        `add it to DRAWN_BY (or to NO_LANDMARK, with the reason).` +
        `\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("draws exactly one per file, so no page can nest two", () => {
    const files = [...new Set([...Object.values(DRAWN_BY), ...Object.keys(ALSO_DRAWS)])];
    const wrong = files
      .map((f) => [f, count(f)] as const)
      .filter(([, n]) => n !== 1)
      .map(([f, n]) => `${f} has ${n}`);
    expect(
      wrong,
      `Exactly one each. Two in a file is a duplicate id and probably a nested ` +
        `<main>, which is invalid and leaves assistive technology choosing.` +
        `\n  ${wrong.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the loading fallback draws one too", () => {
    // Called out separately because it is the easiest to forget: it is not a
    // route, it has no entry in DRAWN_BY, and it is on screen for exactly as
    // long as the slow await in the group's layout takes.
    for (const file of Object.keys(ALSO_DRAWS)) expect(has(file), ALSO_DRAWS[file]).toBe(true);
  });

  it("found the screens it was meant to find", () => {
    // Guards the guard: a walk that silently matched nothing would pass every
    // assertion above while checking none of them.
    const found = ["/", ...pageRoutes()];
    expect(found).toContain("/dashboard");
    expect(found).toContain("/settings/password");
    expect(found).toContain("/user/:param");
    expect(found.length).toBeGreaterThan(15);
    // And every mapped route is a route, so a rename leaves a dangling entry
    // rather than quietly checking nothing.
    const stale = Object.keys(DRAWN_BY).filter((r) => !found.includes(r));
    expect(stale, `DRAWN_BY names routes that no longer exist:\n  ${stale.join("\n  ")}`).toEqual(
      [],
    );
  });
});

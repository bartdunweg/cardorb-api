import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { colour } from "./tokens";

/**
 * Does a token still describe the surface it is named after?
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 *
 * `colour.bgGrouped` is documented in tokens.ts as *"The page. Painted on body,
 * and what the browser chrome is tinted from."* It said #ffffff / #181818 for
 * six days while the page was #fafafa / #171717, because ADR-0024 set that value
 * and the Untitled UI adoption later moved html and body onto `bg-secondary`
 * without anyone touching the token. Nothing failed. Nothing could:
 *
 *   - The token is hand-written hex on purpose. `viewport.themeColor` is a
 *     <meta> tag and the manifest is a JSON document, and neither can read a CSS
 *     custom property, so there is no `var()` binding them to the page.
 *   - tokens.test.ts checks the module against the *generated stylesheet*, which
 *     is generated from the module. Both said #ffffff. Comparing a thing to
 *     itself is exactly as green when both are wrong.
 *   - Every rendering test measures contrast against `surfaces`, which is also
 *     built from the same token. The whole palette agreed with itself about a
 *     page that had not existed for days.
 *
 * The visible symptom was a seam: Safari paints the rubber-band bands above and
 * below the page from theme-color, so every screen had a hairline of the wrong
 * grey at top and bottom. ADR-0089 fixed the values. This file is the part that
 * stops it recurring, and it is deliberately the *only* test in the design
 * folder that reads a component file: the fact it checks is not "the module is
 * self-consistent" but "the module still matches what the app paints".
 *
 * ── How it resolves a colour ───────────────────────────────────────────────
 *
 * The chain, taken one real link at a time rather than assumed:
 *
 *   app/layout.tsx  →  class `bg-secondary`
 *   tailwind.generated.css  →  --color-bg-secondary: var(--color-neutral-50)
 *   node_modules/tailwindcss/theme.css  →  oklch(98.5% 0 none)
 *   this file  →  #fafafa
 *
 * Reading Tailwind's own theme.css rather than hard-coding its ramp is the
 * point: if a Tailwind upgrade retunes `neutral-50`, the page moves and this
 * test says so, which is the same failure in a different disguise.
 */

/* ── oklch → hex ────────────────────────────────────────────────────────────
 *
 * Only the achromatic case, and it is not a shortcut taken to save work — the
 * greys this file resolves are all `oklch(L 0 none)`, and with chroma 0 the Oklab
 * matrices collapse to an identity: a = b = 0 means l = m = s = L, and the
 * LMS→linear-sRGB row sums are 1, so linear = L³ on all three channels.
 *
 * If a chromatic value ever reaches here the maths below would be quietly wrong,
 * so it throws instead. A wrong colour that passes is the failure mode this
 * whole file exists to prevent.
 */
function oklchToHex(css: string): string {
  const m = css.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+(\S+)\s*\)$/);
  if (!m) throw new Error(`not an oklch() value: ${css}`);
  const chroma = Number(m[3]);
  if (chroma !== 0) {
    throw new Error(
      `oklchToHex only handles achromatic values, got chroma ${chroma} in ${css}. ` +
        `Add the full Oklab matrices before using it on a coloured token.`,
    );
  }
  const lightness = m[2] === "%" ? Number(m[1]) / 100 : Number(m[1]);
  const linear = lightness ** 3;
  // The sRGB transfer function, both branches. The dark end of the neutral ramp
  // genuinely lands below the knee: neutral-950 is 0.145³ = 0.003049, under
  // 0.0031308, so it takes the linear branch and the gamma branch would put it
  // a value out.
  const encoded = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  const channel = Math.round(Math.min(1, Math.max(0, encoded)) * 255);
  const hex = channel.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

/** #fff → #ffffff, so a three-digit value and a six-digit one compare equal. */
function expandHex(css: string): string {
  const short = css.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short)
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return css.toLowerCase();
}

const generated = readFileSync("app/styles/tailwind.generated.css", "utf8");
const tailwindTheme = readFileSync("node_modules/tailwindcss/theme.css", "utf8");

/**
 * The last declaration of `name` inside `haystack`.
 *
 * Last rather than first, and that matters: the generated stylesheet declares
 * the light value in `@theme` and the dark value again further down, under
 * `[data-theme="dark"]` and once more under the `prefers-color-scheme` media
 * query. Slicing the file at the dark boundary and taking the last hit in each
 * half is what makes "the light one" and "the dark one" mean anything here.
 */
function declaration(haystack: string, name: string): string {
  const hits = [...haystack.matchAll(new RegExp(`${name}:\\s*([^;]+);`, "g"))];
  const last = hits.at(-1)?.[1]?.trim();
  if (!last) throw new Error(`${name} is not declared`);
  return last;
}

/** Where the generated file stops describing light and starts describing dark. */
const DARK_BOUNDARY = generated.indexOf('[data-theme="dark"]');
const lightHalf = generated.slice(0, DARK_BOUNDARY);
const darkHalf = generated.slice(DARK_BOUNDARY);

/** Follow `var(--x)` through Untitled UI's names into Tailwind's own ramp. */
function resolve(value: string, half: string): string {
  let current = value;
  // Bounded rather than `while (true)`: a var() cycle would otherwise hang the
  // suite instead of failing it, and a hang reads like a broken machine.
  for (let hop = 0; hop < 8; hop++) {
    const ref = current.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (!ref) break;
    const name = ref[1]!;
    // Card Orb's and Untitled UI's names live in the generated file; Tailwind's
    // primitives (--color-white, --color-neutral-*) only exist in its own theme.
    current = half.includes(`${name}:`)
      ? declaration(half, name)
      : declaration(tailwindTheme, name);
  }
  if (current.startsWith("oklch(")) return oklchToHex(current);
  if (current.startsWith("#")) return expandHex(current);
  throw new Error(`could not resolve to a hex value, stopped at: ${current}`);
}

/** What a Tailwind background utility actually paints, per theme. */
function painted(utility: string): { light: string; dark: string } {
  const token = `--color-bg-${utility.replace(/^bg-/, "")}`;
  return {
    light: resolve(declaration(lightHalf, token), lightHalf),
    dark: resolve(declaration(darkHalf, token), darkHalf),
  };
}

/** The `bg-*` utility on an element, read out of the file that renders it. */
function backgroundClassIn(file: string, marker: string): string {
  const src = readFileSync(file, "utf8");
  const at = src.indexOf(marker);
  expect(at, `${marker} is no longer in ${file}`).toBeGreaterThan(-1);
  // A generous window: these classes are written across several wrapped lines.
  const window = src.slice(at, at + 600);
  const hit = window.match(/\bbg-(primary|secondary|tertiary|quaternary)\b/);
  if (!hit) throw new Error(`no Untitled UI bg-* utility found near ${marker} in ${file}`);
  return hit[0];
}

/**
 * Token ↔ the thing it is named after, and where that thing is painted.
 *
 * Adding a Card Orb colour token that names a surface means adding a row. A row
 * is cheap; the six days this table would have caught were not.
 */
const PAIRS = [
  {
    token: "bgGrouped",
    what: "the page",
    // The class on <html>. layout.tsx puts the same one on <body> and the pair
    // below asserts they still agree.
    file: "app/layout.tsx",
    marker: "inter.variable",
  },
  {
    token: "bgSurface",
    what: "a card",
    file: "components/custom/Card.tsx",
    marker: "export const aboutCardClassName",
  },
] as const;

describe("a token still paints the surface it is named after", () => {
  for (const pair of PAIRS) {
    const expected = colour[pair.token];

    it(`${pair.token} is ${pair.what}, and ${pair.file} still paints it`, () => {
      const utility = backgroundClassIn(pair.file, pair.marker);
      const actual = painted(utility);

      expect(
        actual.light,
        `colour.${pair.token}.light says ${expected.light}, but ${pair.file} paints ` +
          `${utility} which resolves to ${actual.light}. One of the two moved without the other.`,
      ).toBe(expected.light.toLowerCase());

      expect(
        actual.dark,
        `colour.${pair.token}.dark says ${expected.dark}, but ${pair.file} paints ` +
          `${utility} which resolves to ${actual.dark}. One of the two moved without the other.`,
      ).toBe(expected.dark.toLowerCase());
    });
  }

  it("html and body carry the same background, or Safari shows a seam", () => {
    // mechanics.test.ts asserts *that* both elements carry one; this asserts they
    // carry the *same* one. Two different page colours would give exactly the
    // overscroll seam theme-color was fixed for, from the other direction.
    const src = readFileSync("app/layout.tsx", "utf8");
    const classes = [...src.matchAll(/\bbg-(primary|secondary|tertiary)\b/g)].map((m) => m[0]);
    const onHtmlAndBody = classes.slice(0, 2);
    expect(onHtmlAndBody).toHaveLength(2);
    expect(onHtmlAndBody[0], "html and body disagree about the page colour").toBe(onHtmlAndBody[1]);
  });
});

/**
 * ── The other half of the same problem ─────────────────────────────────────
 *
 * A token can also stop describing a surface by having no surface at all.
 *
 * When this check was first written it reported five: `labelQuaternary`,
 * `glass`, `tint`, `tintLabel` and `danger`, each surviving as a generated
 * custom property and a paragraph of measured rationale and nothing else.
 * ADR-0090 deleted all five and moved their measurements into the record, so the
 * expected answer here is now **none**, and that is what makes this assertion
 * worth anything: an empty set cannot quietly accumulate.
 *
 * Deliberately *not* an allow-list keyed by token name. A list with entries in
 * it is a list people add to; a list that must stay empty is one they have to
 * argue with. If a token genuinely has to outlive its last consumer, this test
 * is where that argument gets written down — by turning it back into a keyed
 * map, on purpose and in a diff.
 *
 * Two tokens are closer to the line than they look and legitimately pass:
 * `labelSecondary` and `labelTertiary` have no consumer in the app itself and
 * are alive only because the two Open Graph images render them. Satori draws
 * from inline styles and cannot read a stylesheet, so they reach the module
 * directly. That is a real paint site — it is just not one you find by grepping
 * classNames.
 */
const KNOWN_UNPAINTED: Record<string, string> = {};

/** camelCase → kebab-case, the rule the generator names custom properties with. */
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/**
 * Every file that could paint with a token.
 *
 * Four exclusions, and two of them are the whole difficulty of writing this:
 *
 *   - `tailwind.generated.css` declares all of them by definition, and the
 *     vendored `untitled-theme.css` is upstream's copy, not this app.
 *   - Tests: a token used only by its own test is not painted anywhere.
 *   - **`lib/design/tokens.ts` itself.** Its `surfaces` fixture reads tokens to
 *     composite contrast backdrops. That is the module talking to itself, not a
 *     surface — and it is exactly how `glass` read as live for as long as it
 *     did, while no component had rendered it since ADR-0061.
 *   - **`app/brand/page.tsx`.** It is a catalogue of the palette: it renders a
 *     swatch of every token by design, so counting it would mean no token can
 *     ever be reported dead. The page listing a colour is not the app using it.
 */
const SOURCES = ["app", "components", "lib", "hooks", "utils"].flatMap((dir) => walk(dir));

function walk(dir: string): string[] {
  const { readdirSync, statSync, existsSync } = require("node:fs") as typeof import("node:fs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) return walk(path);
    if (!/\.(ts|tsx|css)$/.test(path)) return [];
    if (path.includes(".test.")) return [];
    if (path.endsWith("tailwind.generated.css")) return [];
    if (path.endsWith("untitled-theme.css")) return [];
    if (path === "lib/design/tokens.ts") return [];
    if (path === "app/brand/page.tsx") return [];
    return [path];
  });
}

const ALL_SOURCE = SOURCES.map((f) => readFileSync(f, "utf8")).join("\n");

/**
 * Comments are stripped before the search, and that is the load-bearing part.
 *
 * Every token ADR-0090 retired is still *named* across this codebase, in the
 * comments explaining that it was retired — several of them written by that very
 * change. Counting a comment as a consumer would report every one of them as
 * live, which is the precise opposite of what this asserts.
 */
const CODE_ONLY = ALL_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("every colour token is painted somewhere", () => {
  const COLOUR_TOKENS = Object.entries(colour)
    .filter(([, v]) => typeof v === "object" && v !== null && "light" in v)
    .map(([k]) => k);

  const unpainted = COLOUR_TOKENS.filter((key) => {
    const name = kebab(key);
    const asVariable = new RegExp(`var\\(\\s*--color-${name}\\s*\\)`);
    const asUtility = new RegExp(
      `\\b(bg|text|border|ring|fill|stroke|decoration|outline|from|via|to)-${name}(?![a-z-])`,
    );
    // themeColor and the manifest reach these through the module, not through
    // CSS, so a TypeScript reference counts as a paint site too.
    const asModule = new RegExp(`colour\\.${key}\\b`);
    return !asVariable.test(CODE_ONLY) && !asUtility.test(CODE_ONLY) && !asModule.test(CODE_ONLY);
  });

  it("no colour token has outlived its last consumer", () => {
    expect(
      unpainted.sort(),
      `${unpainted.join(", ")} paint nothing: no var(--color-…), no utility class, no ` +
        `colour.… reference outside tokens.ts and /brand. Delete them and move the ` +
        `measurements into a decision record, the way ADR-0090 did — or, if one genuinely ` +
        `has to outlive its consumers, say why in KNOWN_UNPAINTED and explain it there.`,
    ).toEqual(Object.keys(KNOWN_UNPAINTED).sort());
  });

  it("every recorded retirement says why", () => {
    // Vacuous while KNOWN_UNPAINTED is empty, and kept for exactly that reason:
    // the moment somebody adds a token to it, a bare "unused" will not do.
    for (const [token, reason] of Object.entries(KNOWN_UNPAINTED)) {
      expect(reason.length, `${token} needs a reason, not a placeholder`).toBeGreaterThan(20);
    }
  });
});

/**
 * WCAG contrast, in enough maths to hold the claims this project makes.
 *
 * It exists because two test files the stylesheets cite — `design-system.test.ts`
 * and `e2e/a11y.spec.ts` — are gone from the repo, and every colour in
 * tokens.css is justified by a measured ratio in a comment beside it. That made
 * the comments the test suite. They are good comments and they cannot fail a
 * build.
 *
 * No dependency, and none is needed: this is four formulae. Written here rather
 * than reached for so it can also composite a translucent surface over its
 * backdrop, which is the part an off-the-shelf checker usually will not do —
 * and every failure this project actually recorded (#767676 at 4.47 on the
 * glass, #878787 at 4.26 on the control glass) was found on a composited
 * surface rather than on a flat one.
 */

export type Rgb = { r: number; g: number; b: number };

/** `#rgb`, `#rrggbb`, or `rgba(r, g, b, a)` — the three forms tokens.css uses. */
export function parse(colour: string): Rgb & { a: number } {
  const text = colour.trim();

  const rgba = text.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1]!.split(/[,/]/).map((p) => Number(p.trim()));
    return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts[3] ?? 1 };
  }

  const hex = text.replace("#", "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    a: 1,
  };
}

/**
 * A translucent colour flattened onto what is behind it.
 *
 * The reason this file is not three lines. `--glass-bg` is
 * `rgba(254,254,254,.78)` and it sits on the page, so the colour a reader
 * actually sees behind the text is neither of those two — and the tiers were
 * measured against exactly that composite.
 */
export function over(top: string, backdrop: string): string {
  const t = parse(top);
  const b = parse(backdrop);
  if (t.a >= 1) return top;
  const mix = (x: number, y: number) => Math.round(x * t.a + y * (1 - t.a));
  return `rgb(${mix(t.r, b.r)}, ${mix(t.g, b.g)}, ${mix(t.b, b.b)})`;
}

/** Relative luminance, per WCAG 2.1. */
function luminance(colour: string): number {
  const { r, g, b } = parse(colour);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * The ratio between two colours, 1 to 21.
 *
 * Rounded to two decimals on purpose: the comments in tokens.css quote figures
 * like "4.47:1" and "5.28", and a test that reports 4.4699999 when it disagrees
 * with a comment makes the reader check their arithmetic instead of the colour.
 */
export function ratio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

/**
 * WCAG contrast, in enough maths to hold the claims this project makes.
 *
 * Deleted with the token tests on 2026-08-22 and restored the same day, because
 * removing it removed the only thing that could fail when a colour stopped
 * being readable. This project has already shipped that bug once: #767676 went
 * out at 4.47 on the glass, under a rule that asks for 4.5, and the comment
 * beside it said the right number while the value did not.
 *
 * No dependency, and none is needed: this is four formulae. Written here rather
 * than reached for so it can also composite a translucent surface over its
 * backdrop, which is the part an off-the-shelf checker usually will not do —
 * and every failure this project actually recorded (#767676 at 4.47 on the
 * glass, #878787 at 4.26 on the control glass) was found on a composited
 * surface rather than on a flat one.
 */

export type Rgb = { r: number; g: number; b: number };

/**
 * `#rgb`, `#rrggbb`, `rgba(r, g, b, a)`, or `rgb(r g b / a)`.
 *
 * The space-separated form is the fourth because it had to be: this split on
 * `[,/]` alone, so Untitled UI's own `rgb(127 86 217)` — which is how the brand
 * ramp is written in the generated stylesheet — parsed to NaN and every ratio
 * measured against it came back NaN. `expect(NaN).toBeGreaterThanOrEqual(4.5)`
 * does fail, so it surfaced, but a caller comparing the other way round would
 * have got a silent pass. Splitting on whitespace too costs nothing and covers
 * both spellings of the same colour.
 */
export function parse(colour: string): Rgb & { a: number } {
  const text = colour.trim();

  /**
   * oklch(), because Tailwind's own palette is written in it and every
   * semantic token in theme.css resolves down to one. Only the conversion is
   * here; the resolving of `var()` and `light-dark()` is
   * scripts/theme-resolve.mjs, shared with the token generator so the two
   * cannot disagree about what a token is.
   */
  const oklch = text.match(
    /^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+(none|[\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i,
  );
  if (oklch) {
    const l = Number(oklch[1]) > 1 ? Number(oklch[1]) / 100 : Number(oklch[1]);
    const c = Number(oklch[2]);
    const h = oklch[3] === "none" ? 0 : Number(oklch[3]!);
    const alphaText = oklch[4];
    const a = alphaText
      ? alphaText.endsWith("%")
        ? Number(alphaText.slice(0, -1)) / 100
        : Number(alphaText)
      : 1;
    const hr = (h * Math.PI) / 180;
    const [A, B] = [c * Math.cos(hr), c * Math.sin(hr)];
    const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const linear = [
      +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
      -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
      -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    ];
    const channel = (x: number) => {
      const g = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, g)) * 255);
    };
    return { r: channel(linear[0]!), g: channel(linear[1]!), b: channel(linear[2]!), a };
  }

  const rgba = text.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1]!
      .split(/[,/\s]+/)
      .filter(Boolean)
      .map((p) => Number(p.trim()));
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

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cx } from "@/utils/cx";
import { controlPx, controlPxRect, radius } from "./tokens";

/**
 * The two shapes a control can be in, and the three ways that quietly breaks.
 *
 * A control's corner radius is `var(--radius-control)` and its side padding is
 * `var(--control-px-*)`. Nothing reads a literal, which is what lets a whole
 * form become rectangular from one class on its container. It also means every
 * failure in this mechanism is a *silent* one — an undeclared custom property
 * is dropped and the element inherits, so the build passes and the button is
 * quietly the wrong shape.
 *
 * `vars.test.ts` covers the first failure (a token nothing declares). These are
 * the two it cannot see.
 */

const generated = readFileSync("app/styles/tailwind.generated.css", "utf8");

describe("a caller's radius beats the control's", () => {
  /**
   * The bug this was written for, which was live and invisible before the
   * shapes existed.
   *
   * tailwind-merge only replaces a class when it recognises both as belonging
   * to the same group, and it knows Tailwind's radius scale, not this
   * project's. So `cx("rounded-lg", "rounded-orb-sm")` kept **both**, and which
   * one the element wore came down to the order Tailwind emitted the two rules
   * in — the same "two utilities on one element, order decided by the compiler"
   * hazard as ADR-0012 and ADR-0017.
   *
   * Two live call sites depend on the override winning: `SigninShell`'s wide
   * button and `ViewOptions`' segments both pass a `rounded-orb-*` through
   * `className`. Both looked correct, because the base was 8px and the override
   * was 8px and a coin-flip between two identical values always lands right.
   *
   * With a capsule as the base, it stops landing right. `utils/cx.ts` declares
   * the scale from `tokens.ts` so the merge is decided rather than raced.
   */
  const overrides: [string, string][] = [
    ["rounded-control", "rounded-none"],
    ["rounded-control", "rounded-full"],
    ["rounded-control", "rounded-orb-sm"],
    ["rounded-control", "rounded-pill"],
    ["first:rounded-l-control", "first:rounded-l-none"],
  ];

  for (const [base, override] of overrides) {
    it(`${override} replaces ${base} rather than joining it`, () => {
      expect(cx(base, override)).toBe(override);
    });
  }

  it("covers every radius token, including ones added after this was written", () => {
    // The reason utils/cx.ts derives the list from the token module instead of
    // spelling it out: a hand-kept list stops covering the scale the first time
    // somebody adds to it, and does so silently. This fails when that happens.
    for (const name of Object.keys(radius)) {
      const kebab = name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      expect(cx("rounded-orb-md", `rounded-${kebab}`)).toBe(`rounded-${kebab}`);
    }
  });
});

describe("the rectangle shape is what buttons wore before it existed", () => {
  /**
   * Not decoration. The whole claim of the rectangle shape is that it is the
   * *old* button, so a screen that opts out gets back exactly what it had —
   * not a near miss nobody would notice in review but everybody would notice
   * side by side. These were the five `px-*` values in button.tsx's size
   * recipes before the shape tokens: 2.5, 3, 3.5, 4 and 4.5 spacing steps at
   * Tailwind's 4px, so 10, 12, 14, 16 and 18px.
   */
  const before: Record<keyof typeof controlPxRect, string> = {
    xs: "10px",
    sm: "12px",
    md: "14px",
    lg: "16px",
    xl: "18px",
  };

  for (const [size, value] of Object.entries(before)) {
    it(`${size} is still ${value}`, () => {
      expect(controlPxRect[size as keyof typeof controlPxRect]).toBe(value);
    });
  }

  it("is 8px, the radius buttons had", () => {
    expect(radius.orbSm).toBe("8px");
  });

  it("gives the round shape more room at the ends, at every size", () => {
    // The optical rule the two scales exist for: a capsule curves away from its
    // text for the control's full height, so equal padding does not read as
    // equal. A round value that ever drops to or below its rectangle
    // counterpart means somebody tuned one scale and forgot the other.
    for (const size of Object.keys(controlPx) as (keyof typeof controlPx)[]) {
      expect(
        parseFloat(controlPx[size]),
        `round ${size} (${controlPx[size]}) must exceed rectangle ${size} (${controlPxRect[size]})`,
      ).toBeGreaterThan(parseFloat(controlPxRect[size]));
    }
  });
});

describe("both shape classes reach the stylesheet", () => {
  /**
   * An `@utility` block is a definition, not an output: Tailwind emits it only
   * where it finds the class name written out in source. So a shape switched by
   * an assembled name — `` `shape-${shape}` `` — would compile clean, ship no
   * rule, and leave the control wearing whatever it inherited.
   *
   * Asserting on the generated sheet rather than on the built output because
   * this runs in `npm run check`, before any build. What the *build* does with
   * them was verified by hand against `.next/static` and is recorded in the
   * decision record.
   */
  for (const name of ["shape-round", "shape-rectangle"]) {
    it(`@utility ${name} is generated`, () => {
      expect(generated).toContain(`@utility ${name} {`);
    });
  }

  it("shape-round restates the defaults rather than assuming them", () => {
    // It looks redundant against :root and is not: it is the only way back to
    // round from inside a shape-rectangle block. If it ever stops declaring the
    // full set, a nested round control silently keeps the rectangle's padding.
    const block = generated.match(/@utility shape-round \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(block).toContain(`--radius-control: var(--radius-btn);`);
    for (const [size, value] of Object.entries(controlPx)) {
      expect(block).toContain(`--control-px-${size}: ${value};`);
    }
  });

  it("shape-rectangle sets every variable shape-round does", () => {
    // A variable set by one and not the other is a leak: switch to rectangle
    // and one padding stays round, at one size, on whichever screen uses it.
    const names = (css: string, block: string) =>
      [
        ...(css.match(new RegExp(`@utility ${block} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "").matchAll(
          /(--[a-z-]+):/g,
        ),
      ].map((m) => m[1]);

    expect(names(generated, "shape-rectangle")).toEqual(names(generated, "shape-round"));
  });
});

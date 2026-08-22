"use client";

import { Check, ChevronLeft, ChevronRight } from "@untitledui-pro/icons/line";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import type { Facet } from "@/components/custom/cards-fields";
import { segmentSelectedClassName } from "@/components/custom/Segmented";

/**
 * The inline row's two kinds of key, kept apart so a facet value spelled
 * "all" cannot pretend to be the All segment. React Aria needs an id per
 * item; a facet value is arbitrary text out of the collection.
 */
const ALL_KEY = "all:";
const valueKey = (value: string) => `value:${value}`;

/**
 * How many answers a facet may have before it goes behind a row of its own.
 * Era is the reason: it is Vintage and Modern and nothing else, and going a
 * level in to tick one of two boxes is a press to reach a press.
 */
export const INLINE_MAX = 3;

/**
 * The facets, drawn once, for both things that show them.
 *
 * FilterMenu and FilterSheet were two files describing the same two-level
 * list — the facets, then the values inside one — under two vocabularies:
 * `.filter-menu-name` here, `.sheet-option-name` there. Both are always
 * mounted, with the stylesheet choosing which is visible, so every row existed
 * twice and drifted once: the dropdown grew inline segments for the short
 * facets and the sheet never did.
 *
 * One markup, one set of class names, styled by whichever wrapper it lands in.
 * `.filter-menu-panel .facet-row` is a compact dropdown row; `.sheet .facet-row`
 * is a 48px target for a thumb. That difference is real and stays in CSS, which
 * is where it belongs.
 *
 * What does *not* move in here is staging. The dropdown applies a tick the
 * moment it is made, because the page is visible beside it; the sheet holds
 * every tick in a draft until Apply, because it covers the page and there is
 * nothing to watch change. So this component never touches a facet's own
 * handlers — it asks the caller what is selected and tells the caller what was
 * pressed, and the caller decides whether that means "now" or "on Apply".
 */
export type FilterOptionsProps = {
  facets: Facet[];
  /** Which facet is drilled into, or null for the list of facets. */
  openFacet: string | null;
  onOpenFacet: (key: string | null) => void;
  /** What counts as selected — the live set, or a draft of it. */
  selected: (facet: Facet) => ReadonlySet<string>;
  onToggle: (facet: Facet, value: string) => void;
  onReplace: (facet: Facet, next: Set<string>) => void;
};

/**
 * Where these rows are drawn, because the two are not the same size.
 *
 * `.sheet .facet-row` overrode `.filter-menu-panel .facet-row` to 48px, which
 * is what a thumb hits without aiming; the dropdown's 32px is right for a
 * pointer. That override is a descendant selector, and a Tailwind utility on
 * the element beats one regardless of specificity — ADR-0012 and ADR-0017 are
 * both that fact, found the hard way, twice.
 *
 * So the variant comes in as a prop instead of being read off an ancestor. The
 * caller knows which it is: FilterMenu is the dropdown, FilterSheet is the
 * sheet.
 */
export default function FilterOptions({
  facets,
  openFacet,
  onOpenFacet,
  selected,
  onToggle,
  onReplace,
  variant = "menu",
}: FilterOptionsProps & { variant?: "menu" | "sheet" }) {
  const row =
    variant === "sheet"
      ? "gap-3 min-h-12 px-4 text-primary"
      : "gap-2 p-2 rounded-md text-secondary hover:bg-primary_hover hover:text-primary";

  /* The same split, for the row that goes back up a level. The sheet's is a
     heading you can press — it is the only thing at the top of the panel — and
     the dropdown's is a divider line above the list. */
  /* The dropdown scrolls its own list — several hundred Pokémon, so the panel
     moves rather than the page. The sheet is already a scrolling surface and
     capping it would give it two scrollbars. */
  const list =
    variant === "sheet" ? "" : "max-h-[300px] overflow-y-auto overscroll-contain";

  /* The always-open facets at the top of the panel. Two ancestors said the same
     thing in cards.css — `.sheet .facet-inline` and `.filter-menu-panel
     .facet-inline` — differing only in padding, so the difference is the prop
     rather than the selector now. `+ .facet-inline` becomes a sibling variant. */
  const inlineClassName = [
    "facet-inline flex flex-col gap-2 [&+.facet-inline]:pt-0",
    /* "The segmented control inside fills the row" used to be said from here,
       through `[&_.cards-segmented]:w-full` and two more like it. Those class
       names no longer exist — the control is Untitled UI's ButtonGroup and it
       says its own width, a few lines down. Reaching into a child by class
       name is the arrangement ADR-0017/0018 keep catching; this is one fewer
       of them. */
    variant === "sheet" ? "px-4 py-3" : "px-2 pt-2 pb-3",
  ].join(" ");

  const back =
    variant === "sheet"
      ? "gap-1 p-0 text-lg font-semibold text-primary"
      : "gap-1 w-full p-2 mb-1 border-b border-secondary text-sm font-semibold text-primary hover:text-secondary";
  const current = facets.find((f) => f.key === openFacet) ?? null;

  if (current) {
    const on = selected(current);
    return (
      <>
        {/* One row, always the same height, with Clear in it rather than under
            it. It used to appear as its own line the moment a box was ticked,
            which pushed the list down by its height under the pointer that had
            just ticked it — so the next option you meant to click had moved. */}
        <div
          /* Fixed by its content on both sides, so ticking a box fills the
             right-hand side in rather than adding a line that pushes the list
             down under the pointer. min-h-10 is the control height. */
          className="facet-head flex min-h-10 items-center justify-between gap-2 pr-2 [&_.facet-back]:flex-auto"
        >
          <button
            type="button"
            className={`facet-back flex cursor-pointer items-center border-none bg-transparent
              transition-colors duration-100 ease-linear ${back}`}
            onClick={() => onOpenFacet(null)}
            aria-label="Back to all filters"
          >
            <ChevronLeft size={14} strokeWidth={1.75} aria-hidden="true" />
            {current.label}
          </button>
          {on.size > 0 && (
            <button
              type="button"
              className="facet-clear w-full rounded-md border-none bg-transparent p-2 mb-1
                text-left text-sm text-tertiary cursor-pointer
                transition-colors duration-100 ease-linear hover:bg-primary_hover hover:text-secondary"
              onClick={() => onReplace(current, new Set())}
            >
              Clear
            </button>
          )}
        </div>
        <ul className={`facet-list m-0 list-none p-0 ${list}`} role="list">
          {current.options.map((o) => (
            <li key={o.value}>
              {/* Their <Checkbox>, not their classes on a native input.
                  It was the second: a hand-drawn tick, an ::after with
                  `border-width: 0 2px 2px 0` rotated 45 degrees, which is the
                  trick every checkbox looked like before anyone shipped an SVG.
                  It rendered as a thick corner rather than a tick.

                  The comment here used to defend the native input by saying it
                  kept the panel working without JavaScript. That was wrong:
                  `onToggle` is a callback, so this row has never worked without
                  it. React Aria's checkbox is a real input under the hood and
                  keeps the keyboard behaviour the argument was really about. */}
              <Checkbox
                isSelected={on.has(o.value)}
                onChange={() => onToggle(current, o.value)}
                className="facet-option w-full cursor-pointer items-center gap-2.5 rounded-md p-2
                  text-secondary transition-colors duration-100 ease-linear
                  hover:bg-primary_hover hover:text-primary
                  [&>div]:min-w-0 [&>div]:flex-1"
                label={
                  <span className="flex w-full items-center gap-2.5">
                    <span className="facet-name min-w-0 flex-1 truncate">
                      {current.display ? current.display(o.value) : o.value}
                    </span>
                    <span className="facet-count shrink-0 text-sm text-tertiary tabular-nums">
                      {o.count}
                    </span>
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      </>
    );
  }

  const inline = facets.filter((f) => f.options.length > 0 && f.options.length <= INLINE_MAX);
  const drilled = facets.filter((f) => f.options.length > INLINE_MAX);

  return (
    <>
      {inline.map((f) => {
        const on = selected(f);
        return (
          <div key={f.key} className={inlineClassName}>
            <span className="facet-inline-label font-body text-sm text-secondary">
              {f.label}
            </span>
            {/* Untitled UI's ButtonGroup directly rather than through
                Segmented, because this row is not the one-answer control that
                component is. A facet of two or three may have both ticked at
                once, so the group is `selectionMode="multiple"` and each
                segment says for itself what its press means — `onPress`, not a
                diff of the selection React Aria hands back.

                `onSelectionChange` is a no-op on purpose: the group is
                controlled from `f.selected` and only the handlers below may
                move it. Without it React Aria treats the control as read-only
                and stops the presses reaching us. */}
            <ButtonGroup
              size="sm"
              aria-label={f.label}
              selectionMode="multiple"
              selectedKeys={on.size === 0 ? [ALL_KEY] : [...on].map(valueKey)}
              onSelectionChange={() => {}}
              className="w-full"
            >
              {/* Ticking nothing is an answer, and on a facet of two it is the
                  commonest one — so it gets a word rather than being the state
                  you reach by unticking whatever is on. */}
              <ButtonGroupItem
                id={ALL_KEY}
                className={`${segmentSelectedClassName} flex-auto min-w-0 justify-center px-2`}
                onPress={() => onReplace(f, new Set())}
              >
                All
              </ButtonGroupItem>
              {f.options.map((o) => (
                <ButtonGroupItem
                  key={o.value}
                  id={valueKey(o.value)}
                  className={`${segmentSelectedClassName} flex-auto min-w-0 justify-center px-2`}
                  onPress={() => onToggle(f, o.value)}
                >
                  {f.display ? f.display(o.value) : o.value}
                </ButtonGroupItem>
              ))}
            </ButtonGroup>
          </div>
        );
      })}

      <ul className={`facet-list m-0 list-none p-0 ${list}`} role="list">
        {drilled.map((f) => {
          const on = selected(f);
          return (
            <li key={f.key}>
              <button
                type="button"
                className={`facet-row flex w-full cursor-pointer items-center border-none bg-transparent
                  text-left text-sm transition-colors duration-100 ease-linear
                  [&>svg:last-child]:shrink-0 [&>svg:last-child]:opacity-40 ${row}`}
                onClick={() => onOpenFacet(f.key)}
              >
                <span className="facet-name min-w-0 flex-1 truncate">{f.label}</span>
                {/* Both are a bare number on screen and the difference between
                    them is a tick you cannot hear. "Type, 3" could be three
                    selected or three to choose from, so the row says which. */}
                {on.size > 0 ? (
                  <span className="facet-on inline-flex shrink-0 items-center gap-[3px] text-sm text-primary tabular-nums">
                    <Check size={13} strokeWidth={1.75} aria-hidden="true" />
                    <span aria-hidden="true">{on.size}</span>
                    <span className="sr-only">{on.size} selected</span>
                  </span>
                ) : (
                  <span className="facet-count shrink-0 text-sm text-tertiary tabular-nums">
                    <span aria-hidden="true">{f.options.length}</span>
                    <span className="sr-only">{f.options.length} options</span>
                  </span>
                )}
                <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

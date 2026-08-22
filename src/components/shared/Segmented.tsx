"use client";

import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";

/**
 * What "this one is on" looks like, and the one place this control departs
 * from ButtonGroup as vendored.
 *
 * ButtonGroup says it with `selected:bg-primary_hover`. On Untitled UI's own
 * neutral ramp that is a legible step; on this app's it is not, because
 * `bg-primary` here is pure white and `bg-primary_hover` is #fafafa. Measured
 * on the built view menu: the chosen segment painted rgb(250,250,250) beside
 * neighbours at rgb(255,255,255), a ratio of 1.04:1, where WCAG 1.4.11 asks
 * 3:1 of anything that carries a control's state. That is ADR-0056's second
 * exception — argued from a measurement, not from taste.
 *
 * `bg-brand-primary_alt` — the tint their own Tabs puts behind a selected
 * `button-brand` tab — was tried next and measured rgb(249,245,255): 1.04:1
 * again. Their tints are built for a page that is not pure white. So the
 * background here has to be the solid, `bg-brand-solid`, which is
 * `--color-brand-600` and still an Untitled UI value rather than a Card Orb
 * one. ADR-0057 already chose that particular blue over the lighter one
 * because a filled accent carrying white text needs 4.5:1 and the lighter
 * measures 4.02.
 */
export const segmentSelectedClassName =
  "selected:bg-brand-solid selected:text-white " +
  "selected:*:data-icon:text-white selected:hover:bg-brand-solid_hover";

const SELECTED = segmentSelectedClassName;

/**
 * A row of choices with one of them on: the era switch and the sort order.
 *
 * Both are a single answer out of three, which is a segmented control rather
 * than a dropdown: three words fit in the bar, and a menu would hide the
 * current answer behind a press.
 *
 * Untitled UI's ButtonGroup underneath, not their Tabs. Tabs is
 * `Tabs`/`TabList`/`TabPanel` and announces itself as a tablist, which is a
 * promise that pressing one reveals a panel; none of these have a panel. A
 * ToggleButtonGroup is one answer out of N and renders the `aria-pressed`
 * buttons this control already had. Their look arrives with it: a joined row
 * with hairlines between the segments, not the pill track on glass that
 * `trackClasses.ts` drew (ADR-0056, and it is on purpose that it looks
 * different).
 */
export default function Segmented<T extends string>({
  label,
  labelledBy,
  value,
  onChange,
  options,
  full,
}: {
  label?: string;
  /** For the panels, which put the name in a `<span>` above the row. */
  labelledBy?: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string])[];
  /** Fill the row and share it evenly — what the filter and view panels want. */
  full?: boolean;
}) {
  return (
    <ButtonGroup
      size="sm"
      aria-label={label}
      aria-labelledby={labelledBy}
      // Exactly one is on at all times. Without this, pressing the segment you
      // are already on deselects it and leaves the control answering nothing —
      // a state none of these four callers has.
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const next = [...keys][0] as T | undefined;
        if (next && next !== value) onChange(next);
      }}
      className={full ? "w-full" : undefined}
    >
      {options.map(([key, text]) => (
        <ButtonGroupItem
          key={key}
          id={key}
          // `flex-auto`, not `flex-1`. `flex-1` is basis-0, so every segment
          // gets the same width whatever its label: measured in the 300px view
          // menu that gave "Set" (needs 22px) a 69px box and "Pokédex" (needs
          // 58) a 62px one, and only the long word was clipped. `flex-auto`
          // grows from each label's own width, so the row still fills but the
          // space goes where it is needed.
          //
          // `px-2` overrides ButtonGroup's own `px-3.5`: four segments plus
          // their padding have to fit a panel, and 28px of padding a segment is
          // most of the budget. `truncate` below is the backstop for a word
          // longer than anything measured here — one word cannot wrap.
          className={
            full ? `${SELECTED} min-w-0 flex-auto justify-center px-2` : SELECTED
          }
        >
          {/* The span is what truncates. `truncate` on the button itself does
              nothing: it is a flex container, and text-overflow does not apply
              to the anonymous box a bare text child sits in. */}
          {full ? <span className="min-w-0 truncate">{text}</span> : text}
        </ButtonGroupItem>
      ))}
    </ButtonGroup>
  );
}

"use client";

import { XClose } from "@untitledui-pro/icons/line";
import { BadgeWithIcon } from "@/components/base/badges/badges";
import Button from "@/components/shared/Button";

export type ActiveFilter = { group: string; value: string; onRemove: () => void };

/**
 * Everything currently narrowing the collection, in one row, each with a cross.
 *
 * The tick-lists say what is on inside them, which means five closed dropdowns
 * and a count that does not add up unless you open all five to find out why.
 * This is the same state said out loud, and removable one at a time without
 * hunting for the list it came from.
 *
 * ── Why not `BadgeWithButton`, which is the obvious component ──────────────
 *
 * Because it puts the cross in a button of its own *inside* the chip, and only
 * that cross removes anything. Measured: a `size-3` icon with `p-0.5` around it
 * is a 16px target, where WCAG 2.2's 2.5.8 asks 24px. The whole chip here is
 * one 28px-tall button, so the target is the chip.
 *
 * That is ADR-0056's second exception — Untitled UI's value is the default
 * *unless* Card Orb's is argued from a measurement — so their look is adopted
 * (`BadgeWithIcon` draws the pill and the cross) and the hit area stays ours.
 * The badge is a `<span>`, so nesting it in the button is valid.
 */
export default function FilterChips({
  filters,
  onClearAll,
}: {
  filters: ActiveFilter[];
  onClearAll: () => void;
}) {
  if (!filters.length) return null;

  return (
    <div
      className="flex items-center flex-wrap gap-2 w-full mt-4"
      role="group"
      aria-label="Active filters"
    >
      {filters.map((f) => (
        <button
          key={`${f.group}-${f.value}`}
          type="button"
          className="cursor-pointer rounded-pill outline-focus-ring focus-visible:outline-2
            focus-visible:outline-offset-2"
          onClick={f.onRemove}
          // The group is in the label but not on screen: "Rarity: Holo" reads
          // as clutter in a row of eight, and is exactly what a screen reader
          // needs to tell one Holo from another.
          aria-label={`Remove ${f.group} filter ${f.value}`}
        >
          <BadgeWithIcon size="lg" color="gray" type="pill-color" iconTrailing={XClose}>
            {f.value}
          </BadgeWithIcon>
        </button>
      ))}
      <Button color="link-gray" size="sm" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}

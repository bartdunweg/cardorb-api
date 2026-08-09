"use client";

import { X } from "lucide-react";

export type ActiveFilter = { group: string; value: string; onRemove: () => void };

/**
 * Everything currently narrowing the collection, in one row, each with a cross.
 *
 * The tick-lists say what is on inside them, which means five closed dropdowns
 * and a count that does not add up unless you open all five to find out why.
 * This is the same state said out loud, and removable one at a time without
 * hunting for the list it came from.
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
    <div className="filter-chips" role="group" aria-label="Active filters">
      {filters.map((f) => (
        <button
          key={`${f.group}-${f.value}`}
          type="button"
          className="filter-chips-chip"
          onClick={f.onRemove}
          // The group is in the label but not on screen: "Rarity: Holo" reads
          // as clutter in a row of eight, and is exactly what a screen reader
          // needs to tell one Holo from another.
          aria-label={`Remove ${f.group} filter ${f.value}`}
        >
          <span>{f.value}</span>
          <X size={13} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
      <button type="button" className="filter-chips-clear" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}

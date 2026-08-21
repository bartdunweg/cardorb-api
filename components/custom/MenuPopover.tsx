"use client";

import type { ReactNode } from "react";
import { Dialog as AriaDialog, DialogTrigger } from "react-aria-components";
import { Button as UntitledButton } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { cx } from "@/utils/cx";

/**
 * The dropdown shell FilterMenu and ViewMenu both open: one button, one panel
 * under it, closing on Escape and on an outside click.
 *
 * ── What this replaced, and why it is not `Dropdown.Root` ──────────────────
 *
 * This was `MenuDetails.tsx`, a `<details>/<summary>` with a hand-written
 * outside-click handler. `<details>` gave the open/close, Escape and the tab
 * order for free; what it did not give was any of the placement, the focus
 * return, or the enter/exit motion, and the one handler it needed had a
 * comment explaining why it listens on `pointerdown` rather than `click`.
 * React Aria has all of that.
 *
 * The obvious target was `Dropdown.Root` — Untitled UI's own — and it is the
 * wrong one, for a reason worth writing down rather than rediscovering.
 * `Dropdown.Root` is React Aria's `MenuTrigger`, which puts `role="menu"` on
 * the panel, and a menu may only contain menu items. What these two panels
 * contain is controls: checkboxes, segmented rows, a back button, a scrolling
 * list. Wrapping those in `role="menu"` would tell a screen reader they are
 * menu items and break arrow-key navigation for all of them — a worse answer
 * than the `<details>` it replaces.
 *
 * So it is `DialogTrigger` + `Dropdown.Popover`: Untitled UI's popover surface
 * — their radius, ring, shadow and the entering/exiting animation — around a
 * `<Dialog>`, which is what a panel of controls actually is. The one piece of
 * their dropdown that does not fit is the one piece that was about menus.
 *
 * ── What is given up, deliberately ────────────────────────────────────────
 *
 * `<details>` opens without JavaScript and this does not. That was already
 * theoretical here: both panels are built entirely from callbacks, so nothing
 * inside either of them has ever worked without JavaScript. The element was
 * carrying an affordance its own contents could not use.
 */
export function MenuPopover({
  trigger,
  badge,
  label,
  panelClassName,
  onToggle,
  children,
}: {
  trigger: ReactNode;
  badge?: ReactNode;
  /** Names the panel, which a dialog needs and a `<details>` did not. */
  label: string;
  panelClassName?: string;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <DialogTrigger onOpenChange={onToggle}>
      <UntitledButton color="secondary">
        <span className="inline-flex items-center gap-2">
          {trigger}
          {badge}
        </span>
      </UntitledButton>

      {/* `w-auto` because Untitled UI's popover is `w-62` for a menu of items
          and these are panels that size themselves. The max-width is the one
          rule the old shell had that is worth keeping: on a narrow window the
          panel has to stay inside the page's own gutters. */}
      <Dropdown.Popover
        placement="bottom left"
        offset={8}
        className={cx(
          "w-auto max-w-[calc(100vw-2*var(--page-pad-x))] border border-secondary",
          "[backdrop-filter:blur(var(--blur-glass))]",
        )}
      >
        <AriaDialog
          aria-label={label}
          className={cx("outline-hidden", panelClassName ?? "w-[280px] p-2")}
        >
          {children}
        </AriaDialog>
      </Dropdown.Popover>
    </DialogTrigger>
  );
}

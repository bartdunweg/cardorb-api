"use client";

import {
  forwardRef,
  useId,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { InputBase } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { ToggleBase } from "@/components/base/toggle/toggle";

/**
 * Shared pieces of every /settings screen: a panel is a card, a hint explains
 * a field, "said" is the one-line result of pressing a button. Used to be
 * app/styles/settings.css's `.settings-panel*`/`.settings-hint`/
 * `.settings-said`/`.settings-input`, shared across Account/Profile/Import/
 * Appearance settings for the same reason FormField.tsx exists.
 */

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

export function SettingsPanels({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("grid gap-4", className)} {...rest} />;
}

/**
 * One group of panels on the single Settings screen — Profile, Account,
 * Import, Appearance — with the heading that used to be a link row on an
 * index page. Every group is on the page at once now, so the heading is what
 * you scan instead of a list of four places to go.
 *
 * The <h2> style is SetIndex.tsx's group heading, the same one the era groups
 * on /collection/sets use, rather than a second heading style that looks
 * nearly like it.
 */
export function SettingsSection({
  title,
  description,
  id,
  danger,
  children,
}: {
  title: string;
  description?: string;
  id: string;
  /** The delete section: the card carries Untitled's error ring. */
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="grid gap-x-8 gap-y-5 border-b border-secondary py-10 first:pt-0 last:border-b-0 last:pb-0 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]"
    >
      {/* Untitled UI's settings-01 layout: the section label and its one-line
          description sit in the left column, the fields in a card on the right.
          The grid collapses to one column on a narrow screen. */}
      <div>
        <h2 id={`${id}-heading`} className="m-0 text-lg font-title-strong text-primary">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-tertiary">{description}</p>}
      </div>
      <SettingsPanel danger={danger} className="flex flex-col gap-6">
        {children}
      </SettingsPanel>
    </section>
  );
}

export function SettingsPanel({
  danger,
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { danger?: boolean }) {
  return (
    <section
      className={cx(
        // Untitled UI's card surface, the same constant Card.tsx uses.
        "p-4 rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset",
        // Deleting everything reads as what it is. Untitled UI's error ring
        // rather than a mix of Card Orb's danger token — same job, their value.
        danger && "ring-error_subtle",
        className,
      )}
      {...rest}
    />
  );
}

/** An <h3>: every panel now sits under a SettingsSection's <h2>. */
export function SettingsPanelTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cx("m-0 mb-3 text-md font-title-strong text-primary", className)} {...rest} />
  );
}

export const settingsHintClassName = "my-2 text-sm text-tertiary";

export function SettingsHint({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx(settingsHintClassName, className)} {...rest} />;
}

/**
 * The one-line result of a save/change, replacing itself as the state moves.
 *
 * A live region by default, and meant to be mounted before the result arrives
 * (render it with an empty string, not conditionally): a region inserted at the
 * same moment as its text is not announced by a screen reader, so the save it
 * reports is silent. `role`/`aria-live` stay overridable via `...rest`.
 */
export function SettingsSaid({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cx("mt-2 text-sm text-primary", className)}
      {...rest}
    />
  );
}

export const SettingsInput = forwardRef<
  HTMLInputElement,
  // `size` is omitted: on a native <input> it is a character count, and on
  // InputBase it is "sm" | "md" | "lg". Nothing here ever passed it.
  Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
    /** Visible field label. Preferred over aria-label: a field whose name you
     *  can see reads as a form rather than a row of unlabelled boxes. */
    label?: string;
    /** Helper text under the field, associated to it for screen readers. */
    hint?: ReactNode;
    /** A control on the same row as the input, to its right — a Save button.
     *  The label stays above the row and the hint below it. */
    action?: ReactNode;
  }
>(function SettingsInput({ className, label, hint, action, id, ...rest }, ref) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      {/* Untitled UI's `InputBase`. Their labelled `Input` above it wants React
          Aria's value/onChange, but these forms use native events and hand a
          `ref` (the CSV file field), so the label sits here and the field stays
          native. `InputBase` carries the focus ring on the group, so it
          survives a leading icon. */}
      <div className="flex items-center gap-3">
        <InputBase
          ref={ref}
          id={fieldId}
          aria-describedby={hintId}
          // Capped: a full-width field on this full-width page is one you aim at
          // rather than read.
          wrapperClassName={cx("w-full max-w-[26rem]", className)}
          {...rest}
        />
        {action}
      </div>
      {hint && (
        <p id={hintId} className="text-sm text-tertiary">
          {hint}
        </p>
      )}
    </div>
  );
});

export function SettingsLink({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("mt-3 text-sm", className)} {...rest} />;
}

/** Applied to the <a> inside SettingsLink. */
export const settingsLinkAnchorClassName = "text-brand-secondary";

/* SettingsRowTitle/SettingsRowBlurb/settingsRowClassName were the four link
   rows of the /settings index. There is no index any more — every section is
   on the one page — so they went with it rather than staying as unused
   primitives that read like a pattern to follow. */

/** .btn--danger, applied alongside the shared .btn class. */
/** Handed to untitledButton({ color: "primary-destructive" }) as extra classes. */
export const dangerButtonClassName = "disabled:opacity-50";

/** A real checkbox, visually hidden, with the track drawn beside it — see
 *  the comment on the original .settings-switch for why. */
export function SettingsSwitch({
  children,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { children: ReactNode }) {
  return (
    <label className="group flex gap-3 items-start cursor-pointer">
      <input type="checkbox" className="absolute opacity-0 w-0 h-0" {...rest} />
      {/* Untitled UI's `ToggleBase`, their component, rather than a hand-drawn
          copy of what it renders — which is what this was: a track, a knob, a
          translate and four transitions, all written out here.

          `ToggleBase` and not `Toggle`. `Toggle` is a React Aria Switch and
          would replace the mechanism; `ToggleBase` is the presentational half,
          driven entirely by props, so the real `<input type="checkbox">` above
          stays exactly where it is. That input is the point: it works in a
          plain form post, and a screen reader announces its state without
          being told to.

          Two states `ToggleBase` expects as props are things only the input
          knows here, so they come in through `className` as `group-has-*`
          variants instead: focus follows the hidden input's own
          `:focus-visible`, and hover is the whole label's. */}
      <span aria-hidden="true" className="flex-none">
        <ToggleBase
          size="sm"
          isSelected={!!rest.checked}
          isDisabled={!!rest.disabled}
          className={cx(
            "motion-reduce:transition-none",
            rest.checked && !rest.disabled && "group-hover:bg-brand-solid_hover",
            "group-has-[:focus-visible]:outline-2 group-has-[:focus-visible]:outline-offset-2",
          )}
        />
      </span>
      {/* The wrapper carries no styling of its own — style the <strong> and
          hint text passed in as children directly (see ProfileSettings.tsx). */}
      <span>{children}</span>
    </label>
  );
}

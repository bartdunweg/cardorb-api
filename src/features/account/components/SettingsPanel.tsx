import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { InputBase } from "@/components/base/input/input";
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
  id,
  children,
}: {
  title: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="text-display-sm font-semibold text-primary m-0 mb-4">
        {title}
      </h2>
      {children}
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
  return <h3 className={cx("m-0 mb-3 text-md font-semibold text-primary", className)} {...rest} />;
}

export const settingsHintClassName = "my-2 text-sm text-tertiary";

export function SettingsHint({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx(settingsHintClassName, className)} {...rest} />;
}

/** The one-line result of a save/change, replacing itself as the state moves. */
export function SettingsSaid({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("mt-2 text-sm text-primary", className)} {...rest} />;
}

export const SettingsInput = forwardRef<
  HTMLInputElement,
  // `size` is omitted, and it is the one prop that could not come along: on a
  // native <input> it is a character count, and on InputBase it is
  // "sm" | "md" | "lg". Nothing here ever passed it.
  Omit<InputHTMLAttributes<HTMLInputElement>, "size">
>(function SettingsInput({ className, ...rest }, ref) {
  return (
    // Untitled UI's `InputBase`, not the recipe copied off it — which is
    // what this was, five classes deep, under a comment saying their
    // component "is a React Aria TextField with no ref to give". That is
    // true of `TextField` and `Input`; `InputBase` is the layer below both
    // and takes a `ref` outright, so the four settings forms that hand this
    // one a ref keep working.
    //
    // Their wrapper also carries the focus ring on the group rather than the
    // field, so it survives a leading icon — which the copy could not do.
    <InputBase
      ref={ref}
      // Capped: the panels span the whole pane now that Settings is a
      // full-width page, and a 900px-wide email field is a field you have to
      // aim at rather than read.
      wrapperClassName={cx("w-full max-w-[26rem]", className)}
      {...rest}
    />
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

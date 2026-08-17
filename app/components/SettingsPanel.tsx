import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

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
      <h2
        id={`${id}-heading`}
        className="[font-size:var(--fs-h2)] font-semibold text-label m-0 mb-4"
      >
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
        "p-4 rounded-lg bg-bg-surface [box-shadow:var(--shadow-card)]",
        // Deleting everything reads as what it is. The only place in the app
        // that uses a warning colour (lib/design/tokens.ts's `danger`).
        danger && "border border-[color-mix(in_srgb,var(--color-danger)_40%,transparent)]",
        className,
      )}
      {...rest}
    />
  );
}

/** An <h3>: every panel now sits under a SettingsSection's <h2>. */
export function SettingsPanelTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cx("m-0 mb-3 [font-size:var(--fs-body)] font-semibold text-label", className)}
      {...rest}
    />
  );
}

export const settingsHintClassName = "my-2 [font-size:var(--fs-small)] text-label-secondary";

export function SettingsHint({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx(settingsHintClassName, className)} {...rest} />;
}

/** The one-line result of a save/change, replacing itself as the state moves. */
export function SettingsSaid({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("mt-2 [font-size:var(--fs-small)] text-label", className)} {...rest} />;
}

export const SettingsInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function SettingsInput({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cx(
          // Capped: the panels span the whole pane now that Settings is a
          // full-width page, and a 900px-wide email field is a field you have
          // to aim at rather than read.
          "w-full max-w-[26rem] py-2 px-3 rounded-btn border border-[var(--color-border-active)]",
          "bg-bg-grouped text-label text-base", // 16px: iOS Safari zooms a smaller field on focus and never zooms back
          "focus-visible:[outline:2px_solid_var(--color-tint)] focus-visible:[outline-offset:1px]",
          className,
        )}
        {...rest}
      />
    );
  },
);

export function SettingsLink({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("mt-3 [font-size:var(--fs-small)]", className)} {...rest} />;
}

/** Applied to the <a> inside SettingsLink. */
export const settingsLinkAnchorClassName = "text-tint-label";

/* SettingsRowTitle/SettingsRowBlurb/settingsRowClassName were the four link
   rows of the /settings index. There is no index any more — every section is
   on the one page — so they went with it rather than staying as unused
   primitives that read like a pattern to follow. */

/** .btn--danger, applied alongside the shared .btn class. */
export const dangerButtonClassName = "bg-danger text-white border-transparent disabled:opacity-50";

/** A real checkbox, visually hidden, with the track drawn beside it — see
 *  the comment on the original .settings-switch for why. */
export function SettingsSwitch({
  children,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { children: ReactNode }) {
  return (
    <label className="group flex gap-3 items-start cursor-pointer">
      <input type="checkbox" className="absolute opacity-0 w-0 h-0" {...rest} />
      <span
        aria-hidden="true"
        className={cx(
          "flex-none w-11 h-[26px] rounded-full bg-[var(--color-border-active)] p-[3px]",
          "[transition:background_0.18s_ease] motion-reduce:transition-none",
          "group-has-[:checked]:bg-[var(--color-tint)]",
          "group-has-[:focus-visible]:[outline:2px_solid_var(--color-tint)] group-has-[:focus-visible]:[outline-offset:2px]",
        )}
      >
        <span
          className={cx(
            "block w-5 h-5 rounded-full bg-white [box-shadow:var(--shadow-image)]",
            "[transition:transform_0.18s_ease] motion-reduce:transition-none",
            "group-has-[:checked]:translate-x-[18px]",
          )}
        />
      </span>
      {/* The wrapper carries no styling of its own — style the <strong> and
          hint text passed in as children directly (see ProfileSettings.tsx). */}
      <span>{children}</span>
    </label>
  );
}

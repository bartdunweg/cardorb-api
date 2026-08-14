import type {
  FormHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
} from "react";

/**
 * Shared field/form primitives for the app's one password box: the login,
 * signup, forgotten-password and set-password screens, and the profile
 * screen's inline sign-in. One place so the four forms cannot drift — this
 * used to be the `.cards-profile-*` classes in app/styles/form.css, kept
 * shared for exactly the same reason (see that file's history).
 *
 * `layout="column"` is the .page-signin override: those four screens stand
 * the field upright and stretch the submit button full width, where the
 * profile screen's inline sign-in wraps a row instead.
 */

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

export const formNoteClassName =
  "m-0 [font-family:var(--font-body)] [font-size:var(--fs-body-s)] leading-relaxed text-label-secondary";

export function FormNote({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx(formNoteClassName, className)} {...rest} />;
}

export function FormError({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cx(
        "m-0 [font-family:var(--font-body)] [font-size:var(--fs-small)] [font-weight:var(--fw-eyebrow)] text-label",
        className,
      )}
      {...rest}
    />
  );
}

/** Tied to its input with aria-describedby; see PasswordForm/SignUpForm. */
export function FormHint({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx("block mt-[0.35rem] text-[0.8125rem] text-label-tertiary", className)}
      {...rest}
    />
  );
}

export function FormForm({
  layout = "row",
  className,
  ...rest
}: FormHTMLAttributes<HTMLFormElement> & { layout?: "row" | "column" }) {
  return (
    <form
      className={cx(
        layout === "column"
          ? "flex flex-col items-stretch gap-2 w-full"
          : "flex flex-wrap items-end gap-3 w-full",
        className,
      )}
      {...rest}
    />
  );
}

export function FormField({
  layout = "row",
  className,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement> & { layout?: "row" | "column" }) {
  return (
    <label
      className={cx(
        "group flex flex-col gap-2 min-w-0",
        layout === "column" ? "flex-none" : "flex-[1_1_200px]",
        className,
      )}
      {...rest}
    />
  );
}

/** Dims with its input via group-has-disabled, whichever side of it the input sits. */
export function FormLabel({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx(
        "[font-family:var(--font-main)] [font-size:var(--fs-small)] [font-weight:var(--fw-eyebrow)]",
        "text-label-secondary group-has-[:disabled]:opacity-60",
        className,
      )}
      {...rest}
    />
  );
}

export function FormInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full min-w-0 h-10 px-[var(--space-3-5)] outline-none text-label",
        "[font-family:var(--font-body)] [font-size:var(--fs-control)] [font-weight:var(--fw-regular)]",
        // Never under 16px: below it iOS zooms the page the moment the field
        // takes focus, which is what --fs-control (max(16px, --fs-body-s)) is for.
        "placeholder:text-label-tertiary",
        // The glass control every control on the site is made of — used to
        // come from components.css's shared "GLASS CONTROL"/"CONTROL"/pill-radius
        // groups via the (now-removed) .cards-profile-field class.
        "border border-[var(--glass-border)] bg-[var(--glass-bg-solid)] rounded-pill",
        "[backdrop-filter:blur(var(--blur-glass))] [box-shadow:var(--shadow-card)]",
        "dark:border-[var(--glass-border-control)]",
        "focus-visible:[border-color:var(--color-border-active)]",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        className,
      )}
      {...rest}
    />
  );
}

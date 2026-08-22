import type { FormHTMLAttributes, HTMLAttributes } from "react";

/**
 * What is left of the shared form primitives: the wrapper, and the three bits
 * of prose around a form.
 *
 * FormField, FormLabel, FormInput and FormHint were here too — they were built
 * them so the login, signup, forgotten-password and set-password screens could
 * not drift apart. They are gone because Untitled UI's Input does that job now,
 * and does it better: the label and the hint are props on the field rather than
 * siblings of it, so React Aria wires aria-describedby itself and the pair
 * cannot come apart the way a hand-written id can.
 *
 * FormForm stays because it is layout rather than a control. `layout="column"`
 * is the old .page-signin override: the door screens stand the field upright and
 * stretch the submit button full width, where the profile screen's inline
 * sign-in wraps a row instead.
 */

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

export const formNoteClassName =
  "m-0 font-body text-sm leading-relaxed text-secondary";

export function FormNote({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx(formNoteClassName, className)} {...rest} />;
}

export function FormError({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cx(
        "m-0 font-body text-xs font-semibold text-primary",
        className,
      )}
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

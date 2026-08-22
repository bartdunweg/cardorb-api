"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/hooks/useSession";
import { FormError, FormForm, FormNote } from "@/components/shared/FormField";
import { SigninLinks, signinLinkClassName } from "@/components/shared/SigninShell";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

/**
 * An address and a password, which is now what those words mean.
 *
 * The label said "Password" for a long time while the thing underneath was one
 * shared passcode in `CARDS_TOKEN`, checked against a single `OWNER_EMAIL`. The
 * screen was telling the truth about what to type and a small lie about what it
 * was. Both are now true.
 *
 * The email field lost its default value with that change. It used to be filled
 * in, on the honest reasoning that there was one account and the address was
 * not a thing anyone had to remember. There is no one address any more, and a
 * login that suggests somebody else's is worse than an empty box.
 *
 * Pulled out of CardsProfile so that /login and the profile screen ask for it
 * the same way. Two copies of a password field is how one of them ends
 * up without the autocomplete hint, or checking against a different endpoint
 * than the other, and neither is the sort of thing anyone notices until it
 * misbehaves.
 *
 * There is no submit button: one field, and Enter sends it. A button next to a
 * single password box is a second thing to aim at for something the keyboard
 * already does, and on a phone it competes with the Go key on the keyboard
 * that is covering half the screen anyway.
 *
 * It posts to /api/v1/session, which verifies the key and sets the cookie. It
 * used to check the key against /api/v1/fields and then store it in this
 * browser; the check has moved to the place that also grants the session, so
 * there is one round trip instead of two and no window where the client thinks
 * it is signed in and the server disagrees.
 */
export default function SignInForm({
  redirectTo,
  note,
  /** "column" on /login, where the field stands upright in a narrow card;
   *  "row" (default) inline in the profile screen's rail, which wraps a row
   *  instead. Mirrors the .page-signin override that used to apply this by
   *  ancestor selector. */
  layout = "row",
}: {
  /**
   * Where to go once it worked. Set on /login, which is a door rather than a
   * place; omitted in the profile screen, where you are already standing in the
   * room and the page only has to redraw with the plus in it.
   */
  redirectTo?: string;
  note?: string;
  layout?: "row" | "column";
}) {
  const router = useRouter();
  const { signIn, error, unconfirmed, resendConfirmation } = useSession();
  const [email, setEmail] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState<string | null>(null);
  /** Set once another confirmation link has been asked for, so it is not asked twice. */
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const key = value.trim();
    if (!key || !email.trim() || busy) return;
    setBusy(true);
    setOffline(null);
    try {
      if (await signIn(email.trim(), key)) {
        setValue("");
        if (redirectTo) router.push(redirectTo);
      }
    } catch {
      // The one failure that is not about the key: no connection at all.
      setOffline("No answer from the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const message = offline ?? error;

  return (
    <>
      {note && <FormNote>{note}</FormNote>}
      {/* Untitled UI's Input and Button, because Untitled UI is the default — this is the proof
          screen for that decision, and /login is it because it is public and
          can therefore actually be photographed (a styling regression once hid here that
          hid behind a login for exactly this reason).

          The wrapper stays FormForm: it is layout, not a control, and the
          row/column split still has to serve the profile screen's inline
          sign-in. What changed is the three things you can see and touch. */}
      <FormForm layout={layout} onSubmit={submit}>
        <Input
          isRequired
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          // react-aria hands over the value, not the event.
          onChange={setEmail}
          placeholder="you@example.com"
          isDisabled={busy}
          size={layout === "column" ? "md" : "sm"}
          className={layout === "column" ? "w-full" : "flex-[1_1_200px] min-w-0"}
        />

        {/* type="password", so it is not read over a shoulder and so a
            password manager offers to keep it. autoComplete tells the manager
            which one, and pairs with the username field above it: without the
            two together, browsers fill this with something they guessed.

            Untitled UI's password input adds a reveal toggle of its own, which
            is a straight gain: the old one had no way to check what you typed. */}
        <Input
          isRequired
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={value}
          onChange={setValue}
          placeholder="••••••••"
          isDisabled={busy}
          isInvalid={Boolean(message)}
          size={layout === "column" ? "md" : "sm"}
          className={layout === "column" ? "w-full" : "flex-[1_1_200px] min-w-0"}
          aria-describedby={message ? "sign-in-error" : undefined}
        />

        {/* A button again. It was Enter alone, which is right for a single
            field: one box, one obvious thing to do with it. Two fields is a
            form, and a form with no visible way to submit leaves you looking
            for one. Enter still works, from either field.

            isLoading rather than a swapped label: it keeps the button the same
            width while it works, where "Signing in…" made it jump. */}
        <Button
          type="submit"
          size={layout === "column" ? "lg" : "md"}
          isDisabled={busy}
          isLoading={busy}
          showTextWhileLoading
          className={layout === "column" ? "mt-2 w-full" : ""}
        >
          Sign in
        </Button>
      </FormForm>
      {/* role="alert", because the message replaces nothing on screen: a wrong
          key leaves the form exactly as it was, and without this the only thing
          that changed is invisible to a screen reader. */}
      {message && (
        <FormError id="sign-in-error" role="alert">
          {message}
        </FormError>
      )}

      {/* The one refusal with a way out, and the way out has to be here.
          /auth/confirm answers a spent link with "ask for a new one", and until
          this existed there was nowhere to ask: signing in fails, and a password
          reset does not help because the password was never the problem. */}
      {unconfirmed && !resent && (
        <FormNote>
          {/* Secondary, not primary: the primary action on this screen is still
              signing in. This is the way out of one specific refusal. */}
          <Button
            color="secondary"
            size="sm"
            // onPress, not onClick: React Aria's own event, so it fires the
            // same way for a tap, a keyboard Enter and a screen reader's
            // activation. onClick type-checks here and would mostly work,
            // which is the sort of "mostly" this repo has been bitten by.
            onPress={async () => {
              setResent(true);
              await resendConfirmation(email.trim());
            }}
          >
            Send a new confirmation link
          </Button>
        </FormNote>
      )}
      {resent && (
        <FormNote role="status">
          A new link is on its way to {email.trim()}. It replaces the old one.
        </FormNote>
      )}

      {/* The two ways out of a login that is not working for you, and they
          belong here rather than on the page: whichever screen shows this form
          shows them, so neither can go missing on one of them. */}
      <SigninLinks>
        <Link href="/signup" className={signinLinkClassName}>
          Create an account
        </Link>
        {" · "}
        <Link href="/password/forgotten" className={signinLinkClassName}>
          Forgot your password?
        </Link>
      </SigninLinks>
    </>
  );
}

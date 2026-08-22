"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/hooks/useSession";
import { MAX_DISPLAY_NAME, MIN_PASSWORD } from "@/lib/core/account";
import { FormError, FormForm, formNoteClassName } from "@/components/shared/FormField";
import { SigninLinks, signinLinkClassName } from "@/components/shared/SigninShell";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

/**
 * Two required fields and one that is not.
 *
 * An address and a password are what an account is; a name is what a collection
 * is called. The *username* used to be a third required field here, asked for
 * before there was anything to name — a simpler form traded for a decision made
 * under no context at all. It is generated instead (generateUsername, in
 * lib/core/account.ts) so the account exists with a working link the moment it
 * is confirmed, and the person picks their own handle later from Settings.
 *
 * The name asked for here is the other half of that, and the reason ADR-0006's
 * "nobody's first choice" downside is smaller than it was: the public page is
 * titled after this, so somebody who fills it in gets "Bart’s Pokémon card
 * collection" without ever visiting Settings. Optional on purpose — it is the
 * one field on this form nothing breaks without, and requiring it would put
 * back the friction the username came out for. Left empty, the page falls back
 * to the generated username and the field waits in Settings.
 *
 * One field, not first name and last name. There is no billing and no shipping
 * here to need the halves separately, and a split asks anyone whose name does
 * not divide in two to pretend that it does.
 */
export default function SignUpForm({ redirectTo = "/cards" }: { redirectTo?: string }) {
  const router = useRouter();
  const { signUp, error } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  /** The address the confirmation went to, once it has. */
  const [sent, setSent] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setLocal(null);

    if (password.length < MIN_PASSWORD) {
      return setLocal(`A password needs at least ${MIN_PASSWORD} characters.`);
    }

    setBusy(true);
    try {
      const result = await signUp(email.trim(), password, name.trim());
      if (!result.ok) return;
      // Waiting on a confirmation link is a state, not a redirect. Sending them
      // to the collection would show an empty screen behind a door they have not
      // opened yet; sending them to a sign-in form would be worse, because the
      // password they just chose does not work until they confirm.
      if (result.pending) return setSent(email.trim());
      router.push(redirectTo);
    } catch {
      setLocal("No answer from the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const message = local ?? error;

  // The form is replaced rather than annotated. Leaving the fields on screen
  // under a success notice invites somebody to press the button again, and the
  // second attempt fails with "already in use" — telling a person who did
  // everything right that they did something wrong.
  if (sent) {
    return (
      <div className={formNoteClassName} role="status">
        <p style={{ margin: "0 0 8px", fontWeight: 500 }}>Check your email</p>
        <p style={{ margin: "0 0 8px" }}>
          A confirmation link is on its way to <strong>{sent}</strong>. Open it and your collection
          is ready.
        </p>
        <p style={{ margin: 0, opacity: 0.75 }}>
          Nothing happens until you do — the account cannot be used before it is confirmed. If the
          message has not arrived in a few minutes, look in your spam folder.
        </p>
      </div>
    );
  }

  return (
    <>
      <FormForm layout="column" onSubmit={submit}>
        {/* First, because it is the friendliest thing on the form and the only
            one that is about the person rather than about the account. No
            `required`: the hint below says what happens if it is skipped, and
            skipping it has to stay a one-second decision. */}
        {/* First, because it is the friendliest thing on the form and the only
            one that is about the person rather than about the account. Not
            `isRequired`: the hint says what happens if it is skipped, and
            skipping it has to stay a one-second decision.

            "(optional)" in the label rather than in the placeholder. A
            placeholder is the only thing on a form that disappears the moment
            somebody uses the field, and it is not reliably read out — so it is
            the wrong place to keep the one fact that decides whether this field
            can be skipped.

            The hint is a prop now, and its id and aria-describedby go with it:
            React Aria wires the description to the input itself, so the two
            cannot come apart the way a hand-written pair can. */}
        <Input
          label="Your name (optional)"
          hint="What your collection is called. You can add or change it later in Settings."
          type="text"
          name="name"
          autoComplete="name"
          value={name}
          onChange={setName}
          maxLength={MAX_DISPLAY_NAME}
          isDisabled={busy}
          className="w-full"
        />

        <Input
          isRequired
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          isDisabled={busy}
          className="w-full"
        />

        {/* new-password, not current-password: it tells a password manager to
            offer to generate one rather than to fill the last one it saw. */}
        <Input
          isRequired
          label="Password"
          hint={`At least ${MIN_PASSWORD} characters.`}
          type="password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••••"
          minLength={MIN_PASSWORD}
          isDisabled={busy}
          className="w-full"
        />

        <Button
          type="submit"
          size="lg"
          isDisabled={busy}
          isLoading={busy}
          showTextWhileLoading
          className="mt-2 w-full"
        >
          Create account
        </Button>

        {/* Notice belongs where the collecting happens, and this is the only
            screen in the app that asks for an email address. Not a tickbox:
            the account is processed to perform a contract, not on consent, and
            a checkbox would misdescribe the basis as well as add a step. */}
        <p className="m-0 mt-1 text-center text-tertiary font-body text-xs">
          By creating an account you agree to our{" "}
          <Link href="/terms" className={signinLinkClassName}>
            terms of use
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className={signinLinkClassName}>
            privacy policy
          </Link>
          .
        </p>
      </FormForm>

      {message && <FormError role="alert">{message}</FormError>}

      <SigninLinks>
        Already have an account?{" "}
        <Link href="/login" className={signinLinkClassName}>
          Sign in
        </Link>
      </SigninLinks>
    </>
  );
}

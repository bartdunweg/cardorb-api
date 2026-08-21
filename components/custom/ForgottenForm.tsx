"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/app/hooks/useSession";
import { FormError, FormForm, FormNote } from "@/components/custom/FormField";
import { SigninLinks, signinLinkClassName } from "@/components/custom/SigninShell";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

/**
 * One field, and one sentence afterwards that is the same whatever happened.
 *
 * "If that address has an account, a link is on its way" is not politeness. The
 * alternative — telling somebody their address is unknown here — turns this
 * form into a way to ask who has an account, one guess at a time, and a
 * password reset page is the most convenient place in any app to ask that from.
 * The endpoint behind it answers the same either way; this only has to not
 * undo that.
 */
export default function ForgottenForm() {
  const { requestReset, error } = useSession();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (await requestReset(email.trim())) setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <>
        <FormNote>
          If that address has an account here, a link to set a new password is on its way. It
          expires in an hour.
        </FormNote>
        <SigninLinks>
          <Link href="/login" className={signinLinkClassName}>
            Back to sign in
          </Link>
        </SigninLinks>
      </>
    );
  }

  return (
    <>
      <FormNote>
        Type the address you signed up with and we will send you a link to set a new one.
      </FormNote>
      <FormForm layout="column" onSubmit={submit}>
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
        <Button
          type="submit"
          size="lg"
          isDisabled={busy}
          isLoading={busy}
          showTextWhileLoading
          className="mt-2 w-full"
        >
          Send me a link
        </Button>
      </FormForm>
      {error && <FormError role="alert">{error}</FormError>}
      <SigninLinks>
        <Link href="/login" className={signinLinkClassName}>
          Back to sign in
        </Link>
      </SigninLinks>
    </>
  );
}

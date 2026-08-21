"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/hooks/useSession";
import { MIN_PASSWORD } from "@/lib/core/account";
import { FormError, FormForm } from "@/components/custom/FormField";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

/**
 * Setting a new password, for somebody already holding a session.
 *
 * No "current password" field, and that is not an oversight. Half the people
 * reaching this screen arrived through a recovery link precisely because they
 * do not have the current one, and a field they cannot fill would make the
 * recovery path impossible. Whether to demand it from the other half is a
 * setting on the account provider (secure_password_change), which applies the
 * rule properly to both — a check written here would be a worse copy of it.
 *
 * Typed once rather than twice. A confirmation field catches a typo you cannot
 * see, and it is the wrong fix: the eye toggle catches the same typo and does
 * not double the work for everyone who did not make one.
 */
export default function PasswordForm() {
  const router = useRouter();
  const { setPassword, error } = useSession();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || value.length < MIN_PASSWORD) return;
    setBusy(true);
    try {
      if (await setPassword(value)) {
        setDone(true);
        router.push("/cards");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FormForm layout="column" onSubmit={submit}>
        {/* The separate "Show password" button is gone, and its job with it.
            Untitled UI's password input carries its own reveal toggle, inside
            the field where the text it reveals actually is — so the control sits
            beside the thing it acts on rather than below it, and there is one
            fewer tab stop between the field and Save.

            It was a <button aria-pressed>, deliberately, because it acts now
            rather than recording a preference. The replacement keeps that: it is
            a button too, labelled "Toggle password visibility". */}
        <Input
          isRequired
          label="New password"
          hint={`At least ${MIN_PASSWORD} characters.`}
          type="password"
          name="new-password"
          autoComplete="new-password"
          value={value}
          onChange={setValue}
          minLength={MIN_PASSWORD}
          isDisabled={busy || done}
          className="w-full"
        />

        <Button
          type="submit"
          size="lg"
          isDisabled={busy || done}
          isLoading={busy}
          showTextWhileLoading
          className="mt-2 w-full"
        >
          Save password
        </Button>
      </FormForm>
      {error && <FormError role="alert">{error}</FormError>}
    </>
  );
}

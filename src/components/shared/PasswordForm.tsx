"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/useSession";
import { MIN_PASSWORD } from "@/lib/core/account";
import { FormError, FormForm } from "@/components/shared/FormField";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

/**
 * Setting a new password, for somebody already holding a session.
 *
 * **Two callers, one screen, and the current-password field is the difference.**
 * Somebody signed in who came here on purpose is asked for the password they
 * already have. Somebody who followed a recovery link is not — they are there
 * precisely because they do not have it, and a required field they cannot fill
 * would make recovery impossible.
 *
 * `viaRecovery` is how the screen is told which it is. It comes from a marker
 * `/auth/confirm` sets while exchanging a `type=recovery` token, read on the
 * server by the page above (lib/api/recovery.ts). Note the direction: **absence
 * is what asks for more.** A marker that fails to arrive shows a field somebody
 * can fill; one wrongly present would hide a check. So the failure mode of the
 * signal is the harmless one.
 *
 * This file used to argue the opposite at length — that no current-password
 * field belonged here at all, because Supabase's `secure_password_change`
 * applied the rule to both halves properly. Two things were wrong with that.
 * The setting is *"require reauthentication"*, and it counts a session as recent
 * for 24 hours, so for the case that prompted this — a borrowed, unlocked,
 * signed-in browser — it did approximately nothing. And `current_password` is a
 * parameter on `updateUser`, not only a dashboard setting, so the app can send
 * it on one path and not the other and leave recovery untouched by
 * construction. See ADR-0082.
 *
 * The new password is typed once rather than twice. A confirmation field catches
 * a typo you cannot see, and it is the wrong fix: the eye toggle catches the
 * same typo and does not double the work for everyone who did not make one.
 */
export default function PasswordForm({ viaRecovery = false }: { viaRecovery?: boolean }) {
  const router = useRouter();
  const { setPassword, error } = useSession();
  const [value, setValue] = useState("");
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const asksForCurrent = !viaRecovery;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || value.length < MIN_PASSWORD) return;
    if (asksForCurrent && current.length === 0) return;
    setBusy(true);
    try {
      // Sent only when the field was shown. The server passes it to Supabase
      // only when it arrives, so the recovery path never carries a parameter
      // that would be checked against a password nobody has.
      if (await setPassword(value, asksForCurrent ? current : undefined)) {
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
        {/* First, so a password manager sees the pair in the order it expects:
            the current one, then the new one. `autoComplete="current-password"`
            is what tells it which is which — without it, managers offer to fill
            both fields with the same saved value. */}
        {asksForCurrent && (
          <Input
            isRequired
            label="Current password"
            hint="The one you are replacing."
            type="password"
            name="current-password"
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
            isDisabled={busy || done}
            className="w-full"
          />
        )}

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

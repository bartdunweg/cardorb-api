"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../hooks/useSession";
import { MIN_PASSWORD } from "../../lib/core/account";
import { FormError, FormField, FormForm, FormHint, FormInput, FormLabel } from "./FormField";
import { signinWideButtonClassName } from "./SigninShell";

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
  const [show, setShow] = useState(false);
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
        <FormField layout="column">
          <FormLabel>New password</FormLabel>
          <FormInput
            type={show ? "text" : "password"}
            name="new-password"
            autoComplete="new-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            minLength={MIN_PASSWORD}
            disabled={busy || done}
            required
            aria-describedby="password-hint"
          />
          <FormHint id="password-hint">At least {MIN_PASSWORD} characters.</FormHint>
        </FormField>

        {/* A button rather than a checkbox: it does something now rather than
            recording a preference, and aria-pressed is what says which it is. */}
        <button
          type="button"
          className="btn"
          onClick={() => setShow((v) => !v)}
          aria-pressed={show}
        >
          {show ? "Hide password" : "Show password"}
        </button>

        <button
          type="submit"
          className={`btn btn--primary ${signinWideButtonClassName} mt-2`}
          disabled={busy || done}
        >
          {busy ? "Saving…" : "Save password"}
        </button>
      </FormForm>
      {error && <FormError role="alert">{error}</FormError>}
    </>
  );
}

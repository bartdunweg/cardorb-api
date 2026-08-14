"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "../hooks/useSession";

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
        <p className="cards-profile-note">
          If that address has an account here, a link to set a new password is on its way. It
          expires in an hour.
        </p>
        <p className="signin-links">
          <Link href="/login">Back to sign in</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <p className="cards-profile-note">
        Type the address you signed up with and we will send you a link to set a new one.
      </p>
      <form className="cards-profile-form" onSubmit={submit}>
        <label className="cards-profile-field">
          <span className="cards-profile-label">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={busy}
            required
          />
        </label>
        <button type="submit" className="btn btn--primary signin-submit" disabled={busy}>
          {busy ? "Sending…" : "Send me a link"}
        </button>
      </form>
      {error && (
        <p className="cards-profile-error" role="alert">
          {error}
        </p>
      )}
      <p className="signin-links">
        <Link href="/login">Back to sign in</Link>
      </p>
    </>
  );
}

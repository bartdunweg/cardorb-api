"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "../hooks/useSession";
import { MIN_PASSWORD } from "../../lib/core/account";

/**
 * Two fields.
 *
 * An address and a password are what an account is. The username used to be
 * a third field here, asked for before there was anything to name — that
 * traded a simpler form for a decision made under no context at all. It is
 * generated instead (generateUsername, in lib/core/account.ts) so the account
 * exists with a working link the moment it is confirmed, and the person picks
 * their own name later from Settings, once there is a collection behind it
 * worth naming well.
 */
export default function SignUpForm({ redirectTo = "/cards" }: { redirectTo?: string }) {
  const router = useRouter();
  const { signUp, error } = useSession();
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
      const result = await signUp(email.trim(), password);
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
      <div className="cards-profile-note" role="status">
        <p style={{ margin: "0 0 8px", fontWeight: 500 }}>Check your email</p>
        <p style={{ margin: "0 0 8px" }}>
          A confirmation link is on its way to <strong>{sent}</strong>. Open it and your
          collection is ready.
        </p>
        <p style={{ margin: 0, opacity: 0.75 }}>
          Nothing happens until you do — the account cannot be used before it is confirmed. If
          the message has not arrived in a few minutes, look in your spam folder.
        </p>
      </div>
    );
  }

  return (
    <>
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

        <label className="cards-profile-field">
          <span className="cards-profile-label">Password</span>
          {/* new-password, not current-password: it tells a password manager to
              offer to generate one rather than to fill the last one it saw. */}
          <input
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
            minLength={MIN_PASSWORD}
            disabled={busy}
            required
            aria-describedby="signup-password-hint"
          />
          <span className="cards-profile-hint" id="signup-password-hint">
            At least {MIN_PASSWORD} characters.
          </span>
        </label>

        <button type="submit" className="btn btn--primary signin-submit" disabled={busy}>
          {busy ? "Creating your account…" : "Create account"}
        </button>
      </form>

      {message && (
        <p className="cards-profile-error" role="alert">
          {message}
        </p>
      )}

      <p className="signin-links">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}

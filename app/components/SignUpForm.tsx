"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "../hooks/useSession";
import { MIN_PASSWORD, validateUsername } from "../../lib/core/account";
import { SITE_URL } from "../../lib/core/config";

/**
 * Three fields, and the third is the one worth explaining.
 *
 * An address and a password are what an account is. The username is what the
 * collection is *reached* by, and asking for it here rather than later is a
 * deliberate trade: it is one more thing to think about before you have seen
 * anything, and it means nobody ever lands on a screen that says "your
 * collection has no name yet". The URL is shown under the field as you type,
 * because "username" is an abstraction and `cardorb.com/user/yours` is not.
 *
 * Checked in the browser and again on the server, which is not duplication for
 * its own sake: validateUsername is one module imported by both, so the rules
 * cannot drift, and the browser copy exists only so the answer arrives while
 * you are still looking at the field. The server's answer is the one that
 * counts, and its message is what gets shown when they disagree.
 *
 * Availability is deliberately not checked as you type. It would mean a request
 * per keystroke against a table of who exists, which is a way to enumerate the
 * membership one letter at a time. The name is claimed on submit, atomically,
 * and "that name is taken" is a fine thing to read once.
 */
export default function SignUpForm({ redirectTo = "/cards" }: { redirectTo?: string }) {
  const router = useRouter();
  const { signUp, error } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);

  // Lowercased and stripped as it is typed rather than rejected afterwards. A
  // form that refuses a capital letter is a form arguing with you about a rule
  // it could have applied itself.
  const onName = (value: string) =>
    setUsername(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setLocal(null);

    const name = validateUsername(username);
    if (!name.ok) return setLocal(name.error);
    if (password.length < MIN_PASSWORD) {
      return setLocal(`A password needs at least ${MIN_PASSWORD} characters.`);
    }

    setBusy(true);
    try {
      if (await signUp(email.trim(), password, username)) router.push(redirectTo);
    } catch {
      setLocal("No answer from the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const message = local ?? error;

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

        <label className="cards-profile-field">
          <span className="cards-profile-label">Your collection&rsquo;s name</span>
          <input
            type="text"
            name="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => onName(e.target.value)}
            placeholder="yourname"
            disabled={busy}
            required
            aria-describedby="signup-username-hint"
          />
          {/* The abstraction made concrete. Shown even while empty, so the
              shape of the answer is visible before the first keystroke. */}
          <span className="cards-profile-hint" id="signup-username-hint">
            {SITE_URL.replace(/^https?:\/\//, "")}/user/{username || "yourname"}
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "../hooks/useSession";

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
}: {
  /**
   * Where to go once it worked. Set on /login, which is a door rather than a
   * place; omitted in the profile screen, where you are already standing in the
   * room and the page only has to redraw with the plus in it.
   */
  redirectTo?: string;
  note?: string;
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
      {note && <p className="cards-profile-note">{note}</p>}
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
          />
        </label>

        <label className="cards-profile-field">
          <span className="cards-profile-label">Password</span>
          {/* type="password", so it is not read over a shoulder and so a
              password manager offers to keep it. autoComplete tells the manager
              which one, and pairs with the username field above it: without the
              two together, browsers fill this with something they guessed. */}
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="••••••••"
            disabled={busy}
            aria-describedby={message ? "sign-in-error" : undefined}
          />
        </label>

        {/* A button again. It was Enter alone, which is right for a single
            field: one box, one obvious thing to do with it. Two fields is a
            form, and a form with no visible way to submit leaves you looking
            for one. Enter still works, from either field. */}
        <button type="submit" className="btn btn--primary signin-submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {/* role="alert", because the message replaces nothing on screen: a wrong
          key leaves the form exactly as it was, and without this the only thing
          that changed is invisible to a screen reader. */}
      {message && (
        <p className="cards-profile-error" id="sign-in-error" role="alert">
          {message}
        </p>
      )}

      {/* The one refusal with a way out, and the way out has to be here.
          /auth/confirm answers a spent link with "ask for a new one", and until
          this existed there was nowhere to ask: signing in fails, and a password
          reset does not help because the password was never the problem. */}
      {unconfirmed && !resent && (
        <p className="cards-profile-note">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              setResent(true);
              await resendConfirmation(email.trim());
            }}
          >
            Send a new confirmation link
          </button>
        </p>
      )}
      {resent && (
        <p className="cards-profile-note" role="status">
          A new link is on its way to {email.trim()}. It replaces the old one.
        </p>
      )}

      {/* The two ways out of a login that is not working for you, and they
          belong here rather than on the page: whichever screen shows this form
          shows them, so neither can go missing on one of them. */}
      <p className="signin-links">
        <Link href="/signup">Create an account</Link>
        {" · "}
        <Link href="/password/forgotten">Forgot your password?</Link>
      </p>
    </>
  );
}

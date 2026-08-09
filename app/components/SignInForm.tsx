"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCardsKey } from "../hooks/useCardsKey";

/**
 * The one field there is: the password.
 *
 * "Password" on screen, `CARDS_TOKEN` and `x-cards-key` underneath. The name in
 * the code is what curl and the iOS app send and is not worth churning; the
 * name on screen is what someone has to recognise, and nobody has a mental
 * category called "key" that a password manager also fills. The input has been
 * type="password" with autoComplete="current-password" all along, so the label
 * was the only part still saying something else.
 *
 * Pulled out of CardsProfile so that the login at / and the profile screen ask
 * for it the same way. Two copies of a password field is how one of them ends
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
  defaultEmail = "",
}: {
  /**
   * Filled in for you. There is one account, so the address is not a thing
   * anyone has to remember, and it comes from OWNER_EMAIL on the server so the
   * field and the check it is measured against cannot drift apart. It does
   * mean the address is in the page's HTML; it is a name rather than a secret,
   * and the password beside it is what actually opens anything.
   */
  defaultEmail?: string;
  /**
   * Where to go once it worked. Set on /, which is a door rather than a place;
   * omitted in the profile screen, where you are already standing in the room
   * and the page only has to redraw with the plus in it.
   */
  redirectTo?: string;
  note?: string;
}) {
  const router = useRouter();
  const { signIn, error } = useCardsKey();
  const [email, setEmail] = useState(defaultEmail);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState<string | null>(null);

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
            name="cards-key"
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
    </>
  );
}

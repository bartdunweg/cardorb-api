"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
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
   * Where to go once it worked. Set on /, which is a door rather than a place;
   * omitted in the profile screen, where you are already standing in the room
   * and the page only has to redraw with the plus in it.
   */
  redirectTo?: string;
  note?: string;
}) {
  const router = useRouter();
  const { signIn, error } = useCardsKey();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const key = value.trim();
    if (!key || busy) return;
    setBusy(true);
    setOffline(null);
    try {
      if (await signIn(key)) {
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
          <span className="cards-profile-label">Password</span>
          {/* type="password", so it is not read over a shoulder and so a
              password manager offers to keep it. autoComplete tells the manager
              which one: without it, browsers fill the field with an address or
              a name they guessed from the page. */}
          <input
            type="password"
            name="cards-key"
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="••••••••"
            aria-describedby={message ? "sign-in-error" : undefined}
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy || !value.trim()}>
          <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{busy ? "Checking" : "Sign in"}</span>
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

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
            disabled={busy}
            aria-describedby={`sign-in-hint${message ? " sign-in-error" : ""}`}
          />
        </label>
        {/* No submit button. A form with a single field submits on Enter on its
            own — that is implicit submission, and it is why the password can go
            in and go. On a phone the keyboard's own Go key does the same.

            It used to say "Press Enter" at rest. A password box with nothing
            beside it is already a box you press Enter in, so that line was
            instructing someone who was not stuck, on the one screen where there
            is nothing else to do. Empty at rest, and empty means no box: a <p>
            with no content is zero pixels tall.

            Kept in the DOM rather than mounted when it fills, because aria-live
            only announces changes to a region that was already there. Without
            it a screen reader is told nothing at all between the keypress and
            the page moving, which is the whole gap the button used to cover. */}
        <p className="signin-hint" id="sign-in-hint" aria-live="polite">
          {busy ? "Checking…" : ""}
        </p>
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

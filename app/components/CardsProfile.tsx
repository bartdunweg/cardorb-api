"use client";

import { LogOut } from "lucide-react";
import SignInForm from "./SignInForm";
import { useTheme } from "./ThemeProvider";

/**
 * Where the password is typed, and the only screen on /cards that is about the
 * person rather than the collection.
 *
 * A screen next to the dashboard and the dex rather than a dialog, for one
 * reason: it has to be reachable at every width, and the bar that would open a
 * dialog is not there above 1000px. The rail carries it on both sides of that
 * line, which is also why it is not a slot in the bar: signing in happens once
 * per device, and a permanent slot for it would cost the bar the room the
 * search needs every day.
 *
 * The key is checked by asking for something only the key can get: GET
 * /api/v1/fields returns the database's select options, which is what the add
 * form needs anyway. So a wrong key fails here, on the one field there is,
 * rather than after a card has been typed out. That endpoint sits behind the
 * key for exactly this reason; see the note in its route.
 *
 * Not on a card. Every other screen in this pane is a list or a grid with its
 * own panels; this one is a short column of settings, and a panel drawn around
 * it made a phone-sized screen look like a receipt in an empty room.
 */
export default function CardsProfile({
  signedIn,
  onSignOut,
}: {
  signedIn: boolean;
  onSignOut: () => void;
}) {
  const { theme, toggle } = useTheme();

  return (
    <div className="cards-profile">
      <section className="cards-profile-block">
        <h3 className="cards-profile-title">{signedIn ? "Signed in" : "Sign in"}</h3>
        {signedIn ? (
          <>
            <p className="cards-profile-note">
              The session is a cookie on this device, so the plus stays in the bar until you sign
              out or thirty days pass. Adding a card writes a row to the Notion database the rest of
              this page reads.
            </p>
            <button type="button" className="btn" onClick={onSignOut}>
              <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </>
        ) : (
          <SignInForm note="The collection is Bart's to add to. Signed in, a plus appears in the bar and a card can be added from the page that shows it." />
        )}
      </section>

      {/* The site's own switch, spelled out. Everywhere else it is a circle
          floating in the bottom right corner, and on this route that corner is
          where the bar and its plus are, so the floating one stands down here
          (see .theme-toggle in cards.css) and this is where it went. Two named
          choices rather than one button that means the opposite of what it
          shows, which is what a lone sun icon always is. */}
      <section className="cards-profile-block">
        <h3 className="cards-profile-title">Appearance</h3>
        <div className="cards-segmented" role="group" aria-label="Appearance">
          {(
            [
              ["light", "Light"],
              ["dark", "Dark"],
            ] as const
          ).map(([key, text]) => {
            const on = (theme === "dark") === (key === "dark");
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                className={`cards-segment${on ? " is-active" : ""}`}
                // One toggle rather than a setter, because that is what the
                // provider exposes: pressing the side you are already on is
                // the one press that must do nothing.
                onClick={() => !on && toggle()}
              >
                {text}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

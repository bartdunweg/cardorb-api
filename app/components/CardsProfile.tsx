"use client";

import { LogOut } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { FormNote } from "./FormField";
import { cardsSegmentClassName, cardsSegmentedClassName } from "./trackClasses";

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
 *
 * There is no signed-out half any more. CardsView renders this only when
 * `!isPublic`, and derives `signedIn` from the same expression — so the branch
 * holding a SignInForm could not be reached from anywhere, and it was carrying
 * the last piece of copy in the app that named the owner out loud ("The
 * collection is Bart's to add to"), which is how it was found.
 */
const cardsProfileTitleClassName =
  "m-0 [font-family:var(--font-main)] [font-weight:var(--fw-title)] [font-size:var(--fs-card)]" +
  " [line-height:var(--lh-tight)] text-label";

export default function CardsProfile({ onSignOut }: { onSignOut: () => void }) {
  const { theme, toggle } = useTheme();

  return (
    <div className="flex flex-col items-start gap-10 max-w-[52ch]">
      <section className="flex flex-col items-start gap-4 w-full">
        <h3 className={cardsProfileTitleClassName}>Signed in</h3>
        <FormNote>
          The session is a cookie on this device, so the plus stays in the bar until you sign out or
          thirty days pass. Adding a card writes a row to the same database the rest of this page
          reads.
        </FormNote>
        <button type="button" className="btn" onClick={onSignOut}>
          <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </section>

      {/* The site's own switch, spelled out. Everywhere else it is a circle
          floating in the bottom right corner, and on this route that corner is
          where the bar and its plus are, so the floating one stands down here
          (see .theme-toggle in cards.css) and this is where it went. Two named
          choices rather than one button that means the opposite of what it
          shows, which is what a lone sun icon always is. */}
      <section className="flex flex-col items-start gap-4 w-full">
        <h3 className={cardsProfileTitleClassName}>Appearance</h3>
        <div className={cardsSegmentedClassName} role="group" aria-label="Appearance">
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
                className={cardsSegmentClassName(on)}
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

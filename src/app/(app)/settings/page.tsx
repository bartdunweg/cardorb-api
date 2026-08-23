import type { Metadata } from "next";
import { cardsMainTitleClassName } from "@/features/collection/components/cardsPageClasses";
import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/api/viewer";
import { serverClient } from "@/lib/storage/supabase";
import { ownProfile } from "@/lib/storage/postgres";
import { recentImports } from "@/lib/storage/imports";
import AccountSettings from "./_components/AccountSettings";
import AppearanceSettings from "./_components/AppearanceSettings";
import DeleteAccountSettings from "./_components/DeleteAccountSettings";
import ImportSettings from "./_components/ImportSettings";
import ProfileSettings from "./_components/ProfileSettings";
import { SettingsHint, SettingsSection } from "@/features/account/components/SettingsPanel";

/**
 * All of settings, on one page, like every other screen in the shell.
 *
 * This used to be an index of four link rows leading to /settings/profile,
 * /account, /import and /appearance — a defensible shape for a phone, and the
 * wrong one here: changing your name and then your theme cost two navigations
 * and two back presses, and nothing about the account was ever visible at
 * once. Four groups stacked in one column is the whole screen now. The
 * sub-routes are gone; next.config.ts redirects them here, because a
 * confirmation email already in an inbox points at one.
 *
 * /settings/password is the exception and stays where it is
 * (app/settings/password, outside this shell): it is reached from an
 * unauthenticated recovery link as well as from the Account panel here.
 *
 * Read on the server, edited on the client, for all four groups at once. The
 * initial values come from the database rather than from a fetch after mount,
 * so the public-link switch is never briefly off for somebody whose
 * collection is public — a control that shows the wrong state for a frame is a
 * control people press twice.
 */
export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login?next=/settings");

  const db = await serverClient();
  // One client, both reads. The parent (app) layout has already verified the
  // session, so this is the only fetching the screen does.
  const [profile, history] = db
    ? await Promise.all([ownProfile(db, viewer.userId), recentImports(db, viewer.userId, 5)])
    : [null, []];

  return (
    <>
      {/* cardsMainTitleClassName, the same page-title style
          Dashboard/Collection/Wishlist/Sets all share — not a
          similar-looking rebuild of it. */}
      <h1 className={cardsMainTitleClassName}>Settings</h1>
      <p className="mt-1 mb-8 text-md text-tertiary">
        Your public page, your account, and how Card Orb looks.
      </p>

      {/* One readable column, not full-bleed: on a wide pane a card that runs
          the whole width makes every line of body text too long to read. This
          matches Untitled's settings pattern, where the stacked form sits in a
          constrained content column rather than spanning the screen. */}
      {/* shape-rectangle cascades Untitled's rectangle control shape (R-STYLE-013)
          to every input and button in Settings; the cards stay rounded-xl. */}
      <div className="shape-rectangle flex max-w-2xl flex-col gap-8">
        <SettingsSection
          id="profile"
          title="Profile"
          description="Your public page and what anyone with the link can see."
        >
          {profile ? (
            <ProfileSettings initial={profile} />
          ) : (
            // Only this group fails; the rest of the page still works.
            <SettingsHint>Your profile could not be read right now.</SettingsHint>
          )}
        </SettingsSection>

        <SettingsSection
          id="account"
          title="Account"
          description="Your sign-in email and password."
        >
          <AccountSettings email={viewer.email} />
        </SettingsSection>

        <SettingsSection
          id="import"
          title="Import"
          description="Bring a collection in from a CSV file."
        >
          <ImportSettings history={history as never} />
        </SettingsSection>

        <SettingsSection
          id="appearance"
          title="Appearance"
          description="How Card Orb looks on this device."
        >
          <AppearanceSettings />
        </SettingsSection>

        {/* Last, and on its own. Inside the Account group it sat between an
            email field and a theme picker — a red-bordered door marked
            "everything goes" in the middle of ordinary traffic. */}
        <SettingsSection
          id="delete"
          title="Delete this account"
          description="Permanently remove your account and everything in it."
          danger
        >
          <DeleteAccountSettings username={viewer.username} />
        </SettingsSection>
      </div>
    </>
  );
}

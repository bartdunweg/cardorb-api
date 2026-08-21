import type { Metadata } from "next";
import { cardsMainTitleClassName } from "../../components/cardsPageClasses";
import { redirect } from "next/navigation";
import { currentViewer } from "../../../lib/api/viewer";
import { serverClient } from "../../../lib/storage/supabase";
import { ownProfile } from "../../../lib/storage/postgres";
import { recentImports } from "../../../lib/storage/imports";
import AccountSettings from "../../components/AccountSettings";
import AppearanceSettings from "../../components/AppearanceSettings";
import DeleteAccountSettings from "../../components/DeleteAccountSettings";
import ImportSettings from "../../components/ImportSettings";
import ProfileSettings from "../../components/ProfileSettings";
import { SettingsHint, SettingsPanels, SettingsSection } from "../../components/SettingsPanel";

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
      <p className="mt-1 mb-6 text-xs text-tertiary">{viewer.email}</p>

      {/* gap-8 between groups against the panels' own gap-4 inside them: the
          grouping has to be readable as grouping when it is all one scroll. */}
      <div className="flex flex-col gap-8">
        <SettingsSection id="profile" title="Profile">
          {profile ? (
            <ProfileSettings initial={profile} />
          ) : (
            // Only this group fails; the rest of the page still works.
            <SettingsHint>Your profile could not be read right now.</SettingsHint>
          )}
        </SettingsSection>

        <SettingsSection id="account" title="Account">
          <AccountSettings email={viewer.email} />
        </SettingsSection>

        <SettingsSection id="import" title="Import">
          <ImportSettings history={history as never} />
        </SettingsSection>

        <SettingsSection id="appearance" title="Appearance">
          <SettingsPanels>
            <AppearanceSettings />
          </SettingsPanels>
        </SettingsSection>

        {/* Last, and on its own. Inside the Account group it sat between an
            email field and a theme picker — a red-bordered door marked
            "everything goes" in the middle of ordinary traffic. */}
        <SettingsSection id="delete" title="Delete this account">
          <DeleteAccountSettings username={viewer.username} />
        </SettingsSection>
      </div>
    </>
  );
}

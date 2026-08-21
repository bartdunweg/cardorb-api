import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Onboarding from "@/components/custom/Onboarding";
import { currentViewer } from "../../lib/api/viewer";
import { serverClient } from "../../lib/storage/supabase";
import { ownProfile } from "../../lib/storage/postgres";

/**
 * The first minute of a new account.
 *
 * Outside the (app) route group on two counts. That layout redirects an
 * un-onboarded account here, so a wizard living inside it would redirect to
 * itself; and it draws the signed-in furniture — rail, tab bar, navbar — around
 * its children, which is chrome for navigating an app you have not set up yet.
 * app/settings/password sits outside for the second reason alone.
 *
 * noindex comes from the root layout, which sends it on everything but / and
 * /user/<name>; robots.ts disallows this path as well, for the same reason it
 * disallows /login — a crawler that followed it would be indexing the login
 * screen under this address.
 */
export const metadata: Metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

export default async function Welcome() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login?next=/welcome");
  // Been through it already: this screen has nothing left to ask, and coming
  // back to it by typing the address should not re-run a first-run flow.
  if (viewer.onboardedAt) redirect("/collection");

  const db = await serverClient();
  const profile = db ? await ownProfile(db, viewer.userId) : null;
  // No profile row is not a supported state (a trigger makes one with the
  // account), but it is not worth a crash here either — the viewer already
  // carries a username and an avatar, and the two fields it does not carry are
  // exactly the two whose defaults this screen is offering to change.
  const initial = profile ?? {
    username: viewer.username,
    displayName: null,
    isPublic: false,
    avatarUrl: viewer.avatarUrl,
    onboardedAt: null,
  };

  return (
    // The whole screen is the landmark: the welcome flow draws no navigation,
    // only its own steps. See app/layout.tsx for why each screen carries one.
    <main id="main-content">
      <Onboarding
        initial={{
          username: initial.username,
          displayName: initial.displayName,
          isPublic: initial.isPublic,
          avatarUrl: initial.avatarUrl,
        }}
      />
    </main>
  );
}

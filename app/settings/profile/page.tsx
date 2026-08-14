import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentViewer } from "../../../lib/api/viewer";
import { serverClient } from "../../../lib/storage/supabase";
import { ownProfile } from "../../../lib/storage/postgres";
import ProfileSettings from "../../components/ProfileSettings";

/**
 * Read on the server, edited on the client.
 *
 * The initial values come from the database rather than from a fetch after
 * mount, so the switch is never briefly off for somebody whose collection is
 * public — a control that shows the wrong state for a frame is a control people
 * press twice.
 */
export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login?next=/settings/profile");

  const db = await serverClient();
  const profile = db ? await ownProfile(db, viewer.userId) : null;

  if (!profile) {
    return <p className="settings-hint">Your profile could not be read right now.</p>;
  }

  return <ProfileSettings initial={profile} />;
}

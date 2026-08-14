import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentViewer } from "../../lib/api/viewer";
import "../styles/settings.css";

/**
 * Settings, outside the collection shell on purpose.
 *
 * The shell exists to hold a collection: it fetches every card, builds the era
 * groups and hands them to a rail. None of that is wanted here, and paying a
 * megabyte of cards to render a form with three fields would be the kind of
 * cost nobody ever goes back and finds.
 *
 * So this is its own layout with its own narrow column. The way back is a link
 * rather than the rail, which is also the honest shape: settings is somewhere
 * you go and then leave, not a room in the collection.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login?next=/settings");

  return (
    <div className="settings">
      <header className="settings-head">
        <Link href="/dashboard" className="settings-back">
          ← Card Orb
        </Link>
        <h1 className="settings-title">Settings</h1>
        <p className="settings-who">{viewer.email}</p>
      </header>
      {children}
    </div>
  );
}

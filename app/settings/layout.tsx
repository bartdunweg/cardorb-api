import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentViewer } from "../../lib/api/viewer";

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
    <div className="max-w-[640px] mx-auto px-4 pt-6 pb-[var(--page-pad-bottom)]">
      {/* No wrapper class here: the original .settings-head never had a CSS
          rule (an orphan class, never styled), so there was no layout to carry
          forward — just the three children in document order. */}
      <header>
        <Link
          href="/dashboard"
          className="inline-block text-label-secondary no-underline mb-4 hover:text-label [font-size:var(--fs-small)]"
        >
          ← Card Orb
        </Link>
        <h1 className="m-0 [font-size:var(--fs-h2)] font-semibold text-label">Settings</h1>
        <p className="mt-1 mb-6 [font-size:var(--fs-small)] text-label-tertiary">{viewer.email}</p>
      </header>
      {children}
    </div>
  );
}

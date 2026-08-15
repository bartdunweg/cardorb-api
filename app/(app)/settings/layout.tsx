import type { ReactNode } from "react";
import { currentViewer } from "../../../lib/api/viewer";

/**
 * Settings, inside the collection shell like every other screen here now —
 * sidebar/tabbar stay on screen, on explicit instruction, rather than
 * dropping to a bare page the way this route used to. The parent
 * app/(app)/layout.tsx already verifies the session and redirects signed-out
 * visitors, so this only fetches the one field (email) its own header shows;
 * it doesn't need the collection the shell fetches for the other screens.
 *
 * No back link any more either — that was this route's way home before it
 * had a rail/tabbar of its own to use instead.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const viewer = await currentViewer();

  return (
    <div className="max-w-[640px] mx-auto">
      <header>
        {/* .cards-main-title (cards.css), the same page-title style
            Dashboard/Collection/Wishlist/Sets all share — not a
            similar-looking rebuild of it. */}
        <h1 className="cards-main-title">Settings</h1>
        <p className="mt-1 mb-6 [font-size:var(--fs-small)] text-label-tertiary">{viewer?.email}</p>
      </header>
      {children}
    </div>
  );
}

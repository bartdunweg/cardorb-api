"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCollection } from "@/app/(app)/CollectionContext";
import CardsTabBar, { type CardsTab } from "@/components/custom/CardsTabBar";

/**
 * The bar along the bottom, told where it is by the address bar.
 *
 * Wrapped rather than rewritten for the same reason as the rail, and here the
 * argument is stronger: the lit slot slides a measured pill between icons
 * (useSlidingPill), which is a piece of layout maths that a rewrite would
 * either lose or reproduce badly. What routing needed was the answer to "which
 * slot is lit", and that is one function.
 *
 * The four slots are the ones the app is navigated by. Sets and Pokédex used to
 * be here; they are reached from the head of the collection now, because they
 * are two ways of looking at one destination rather than two destinations, and
 * a bar with six slots is a bar you read instead of aim at.
 */

/** Which slot is lit, from a path. */
function tabFrom(pathname: string): CardsTab {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/wishlist")) return "wishlist";
  if (pathname.startsWith("/settings")) return "profile";
  // Every /collection/* screen — the grid, the set index, one set, one era, the
  // Pokédex — is the collection. Lighting a different slot for each would make
  // the bar report where you are inside a screen rather than which screen.
  return "collection";
}

/**
 * Partial on purpose. "sets" and "search" are still in CardsTab because the
 * public link's bar carries them, and that bar is not this one — this adapter
 * only ever hands back the four slots it renders. "profile" still goes to
 * /settings, not a dedicated /profile route — the tab wears the account's
 * name and picture now, but there is nowhere else for it to open.
 */
const HREF: Partial<Record<CardsTab, string>> = {
  dashboard: "/dashboard",
  collection: "/collection",
  wishlist: "/wishlist",
  profile: "/settings",
};

export default function AppTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { onAdd, viewer } = useCollection();

  return (
    <CardsTabBar
      active={tabFrom(pathname)}
      signedIn
      viewer={{ name: viewer.username, avatarUrl: viewer.avatarUrl }}
      onSelect={(tab) => {
        const href = HREF[tab];
        if (href) router.push(href);
      }}
      onAdd={onAdd}
    />
  );
}

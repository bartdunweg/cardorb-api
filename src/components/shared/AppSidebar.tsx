"use client";

import { usePathname, useRouter } from "next/navigation";
import { slugify } from "@/lib/core/slug";
import { useCollection } from "@/app/(app)/CollectionContext";
import CardsSidebar from "@/components/shared/CardsSidebar";

/**
 * The rail, told where it is by the address bar instead of by a useState.
 *
 * A wrapper rather than a rewrite, and that is the point. CardsSidebar carries
 * work that has nothing to do with routing and would be quietly lost by a
 * fresh component: the logo fallbacks, the counts, the widths at which a row
 * belongs to the bar instead of the rail, and the reasoning about which
 * destinations exist at which size. Rewriting it to emit <Link>s would put all
 * of that at risk to gain middle-click, which is worth having and is not worth
 * this.
 *
 * So the change is only where the answer comes from. `selected` was state;
 * it is now derived from the path. `onSelect` set that state; it now navigates.
 * Everything the rail knows about drawing itself is untouched.
 */

/** The rail's vocabulary, from a path. The inverse of `href` below. */
function selectedFrom(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/wishlist")) return "wishlist";
  if (pathname.startsWith("/settings")) return "profile";
  if (pathname.startsWith("/collection/sets")) return "sets";
  /* Before the /collection/set/ match below, which /collection/browse does not
     hit — but the set page it opens onto is /collection/browse/<id>, and this
     has to claim that too or the rail lights Sets while you are browsing. */
  if (pathname.startsWith("/collection/browse")) return "browse";

  const set = pathname.match(/^\/collection\/set\/([^/]+)/)?.[1];
  if (set) return `set:${set}`;
  const era = pathname.match(/^\/collection\/era\/([^/]+)/)?.[1];
  if (era) return `era:${era}`;

  return "all";
}

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sets, setGroups, brokenLogos, onBrokenLogo, onAdd, viewer } = useCollection();

  const selected = selectedFrom(pathname);

  /**
   * The rail speaks in set names and era names; the router speaks in paths.
   * This is the one place that translates, and it is deliberately not clever:
   * a name that slugifies to nothing has no address, so it falls back to the
   * whole collection rather than navigating to /collection/set/ and 404ing.
   */
  const go = (value: string) => {
    if (value === "dashboard") return router.push("/dashboard");
    if (value === "wishlist") return router.push("/wishlist");
    if (value === "profile") return router.push("/settings");
    if (value === "all") return router.push("/collection");
    if (value === "sets") return router.push("/collection/sets");
    if (value === "browse") return router.push("/collection/browse");

    if (value.startsWith("era:")) {
      const slug = slugify(value.slice(4));
      return router.push(slug ? `/collection/era/${slug}` : "/collection");
    }

    const slug = slugify(value);
    return router.push(slug ? `/collection/set/${slug}` : "/collection");
  };

  return (
    <CardsSidebar
      sets={sets}
      setGroups={setGroups}
      // The rail still names sets and eras as it always did; only the two
      // routed forms above arrive prefixed, so they are unwrapped here rather
      // than teaching CardsSidebar about URLs.
      selected={
        selected.startsWith("set:")
          ? (setGroups.flatMap((g) => g.sets).find((s) => slugify(s.name) === selected.slice(4))
              ?.name ?? selected)
          : selected.startsWith("era:")
            ? `era:${setGroups.find((g) => slugify(g.era) === selected.slice(4))?.era ?? ""}`
            : selected
      }
      // The pane swap is client state that no longer exists: below 1000px the
      // rail is simply not on screen, and the sets are a screen of their own at
      // /collection/sets. Undefined renders no attribute, which the stylesheet
      // already reads as "the results".
      pane={undefined}
      onSelect={go}
      signedIn
      onAdd={onAdd}
      brokenLogos={brokenLogos}
      onBrokenLogo={onBrokenLogo}
      // The full era-grouped list is /collection/sets now (SetIndex.tsx) — a
      // real page, not a rail-only view — so the rail collapses it to one row.
      setsAsRow
      viewer={{ name: viewer.username, avatarUrl: viewer.avatarUrl }}
    />
  );
}

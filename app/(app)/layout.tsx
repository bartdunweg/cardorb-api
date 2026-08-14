import { redirect } from "next/navigation";
import { currentViewer } from "../../lib/api/viewer";
import { forGrid } from "../../lib/core/cards";
import { getCards } from "../../lib/core/collection";
import AppShell from "./AppShell";

/**
 * Everything you see once you are signed in.
 *
 * A route group — the parentheses are not in any URL — so /dashboard,
 * /collection and /settings share one shell without sharing a path segment.
 * It is deliberately not a second root layout: there is no <html> here, so
 * moving between these screens stays a client transition rather than a full
 * page load, which is the whole reason the collection can be fetched once.
 *
 * Fetched here rather than per page, and that is what makes the pages thin.
 * A shared layout is preserved across navigations between its own pages, so the
 * megabyte of collection crosses the wire once per hard load and not once per
 * screen. The pages read it out of context; a set page ships a slug.
 *
 * The lock is here too, once, instead of at the top of seven pages. The proxy
 * redirects when the session cookie is missing, but a cookie's presence is not
 * a signature — see proxy.ts, whose own comment used to claim a forged one
 * bought nothing. It buys a page shell now that a cookie names somebody, so
 * this verifies before anything is fetched.
 */
export const dynamic = "force-dynamic";

/**
 * Two hosts every screen in here pulls scans from, opened while the collection
 * is still being fetched rather than when the first <img> is parsed.
 */
function Preconnect({ to }: { to: string[] }) {
  return (
    <>
      {to.map((href) => (
        <link key={href} rel="preconnect" href={href} crossOrigin="anonymous" />
      ))}
    </>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login?next=/dashboard");

  // Derivable fields off before the collection crosses into a client component.
  // See forGrid in lib/core/cards.ts.
  const sets = forGrid(await getCards(viewer.userId));

  return (
    <section className="page-cards">
      <Preconnect to={["https://assets.tcgdex.net", "https://images.pokemontcg.io"]} />
      <AppShell viewer={{ username: viewer.username, email: viewer.email }} sets={sets}>
        {children}
      </AppShell>
    </section>
  );
}

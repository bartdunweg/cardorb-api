import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/api/viewer";
import { forGrid } from "@/lib/core/collection/cards";
import { getCollection } from "@/lib/core/collection/collection";
import AppShell from "./_components/AppShell";
import { pageCardsClassName } from "@/features/collection/components/cardsPageClasses";
// Everything that draws a collection, once for every screen in the shell.
//
// On the layout rather than on each page, which is the difference between this
// and how /cards does it: there the one page that draws a collection imports
// it, here seven do. It was missing entirely when these routes were first
// written — they rendered the markup and none of the 3,199 lines that style
// it — which is a mistake that only shows up if you look at the page rather
// than at the status code, and every route answered 200.
import "@/styles/poke-holo.css";

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

  // An account that has never been set up goes to the welcome flow first, and
  // before the fetch below rather than after it: a brand-new account's
  // collection is empty by definition, and there is no reason to pay for a
  // round trip whose answer nothing on the next screen reads.
  //
  // /welcome sits outside this route group on purpose — inside it, this line
  // would redirect the wizard to itself.
  if (!viewer.onboardedAt) redirect("/welcome");

  // Derivable fields off before the collection crosses into a client component.
  // See forGrid in lib/core/collection/cards.ts.
  //
  // `failed` travels with it because no screen below can work it out: an empty
  // list is a new account and an empty list is an outage, and the two need
  // different sentences.
  const { sets: all, failed } = await getCollection(viewer.userId);
  const sets = forGrid(all);

  return (
    <section className={pageCardsClassName}>
      <Preconnect to={["https://assets.tcgdex.net", "https://images.pokemontcg.io"]} />
      <AppShell
        viewer={{ username: viewer.username, email: viewer.email, avatarUrl: viewer.avatarUrl }}
        sets={sets}
        failed={failed}
      >
        {children}
      </AppShell>
    </section>
  );
}

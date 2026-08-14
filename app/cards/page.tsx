import type { Metadata } from "next";
import { cookies } from "next/headers";
import CardsView from "../components/CardsView";
import { forGrid } from "../../lib/core/cards";
import { getCards } from "../../lib/core/collection";
import { SESSION_COOKIE } from "../../lib/api/guard";
import "../styles/collection.css";

export const metadata: Metadata = {
  title: "Cards",
};

/**
 * Rendered per request rather than cached for an hour.
 *
 * The collection itself is still memoised inside getCards(), so this does not
 * cost a Notion walk per visitor; what changed is that the page now reads a
 * cookie, and a page whose output depends on who is asking cannot be handed to
 * the next person out of a shared cache.
 *
 * The proxy in front of this route means there is always a session by the
 * time it runs, so in practice `signedIn` is true here. It is read rather than
 * assumed because the proxy only checks that a cookie exists, and the two
 * would drift the moment that changes.
 */
export const dynamic = "force-dynamic";

/**
 * The hosts this route's pictures come from, opened while the HTML is still
 * being read.
 *
 * A cold origin costs a DNS lookup, a TCP handshake and a TLS handshake before
 * its first byte, which is two to four hundred milliseconds spent doing
 * nothing. On the portfolio most files had been pulled in-house and this only
 * covered the newest cards; here every scan comes from the catalogues, so it
 * matters more rather than less.
 *
 * React hoists a link element into the head from wherever it is written, which
 * is what makes a per-route hint possible without a per-route head.
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

export default async function CardsPage() {
  const [all, jar] = await Promise.all([getCards(), cookies()]);
  // Derivable fields off before the collection crosses into a client
  // component. See forGrid in lib/core/cards.ts.
  const sets = forGrid(all);
  const signedIn = Boolean(jar.get(SESSION_COOKIE)?.value);

  return (
    <section className="page-cards">
      {/* The portfolio's JSON-LD graph came out here: a CollectionPage, an
          ItemList of sets and a breadcrumb through /about. All of it is for
          search engines, and this app ships noindex (see app/layout.tsx), so
          it would be markup written for a reader that never arrives. */}
      <Preconnect to={["https://assets.tcgdex.net", "https://images.pokemontcg.io"]} />
      <CardsView sets={sets} signedIn={signedIn} />
    </section>
  );
}

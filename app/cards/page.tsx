import type { Metadata } from "next";
import CardsView from "../components/CardsView";
import { getCards } from "../../lib/core/cards";

export const metadata: Metadata = {
  title: "Cards",
};

// An hour. Packs get opened in bursts and then nothing changes for weeks, so
// this is far less volatile than it looks. It has to stay a cached render
// either way: the collection walks every page of the Notion query, and no
// visitor should be waiting on that.
export const revalidate = 3600;

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
  const sets = await getCards();

  return (
    <section className="page-cards">
      {/* The portfolio's JSON-LD graph came out here: a CollectionPage, an
          ItemList of sets and a breadcrumb through /about. All of it is for
          search engines, and this app ships noindex (see app/layout.tsx), so
          it would be markup written for a reader that never arrives. */}
      <Preconnect to={["https://assets.tcgdex.net", "https://images.pokemontcg.io"]} />
      <CardsView sets={sets} />
    </section>
  );
}

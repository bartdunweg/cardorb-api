import { notFound } from "next/navigation";
import CardModal from "../../../components/CardModal";
import CardDetail from "../../../components/CardDetail";
import CardNav from "../../../components/CardNav";
import { cardNeighbours, getCardDetail, getCards, type OwnedCard } from "../../../../lib/core/cards";
import "../../../styles/collection.css";

/**
 * A card, opened from the list.
 *
 * The same data and the same component as /cards/[id], in a dialog rather than
 * on a page. It only ever renders for a client-side navigation from inside the
 * app: type the URL, refresh, or open it in a new tab and Next serves the real
 * route instead, which is the one that carries the metadata.
 *
 * Intercepted so that closing it gives the list back exactly as it was. /cards
 * is a client component holding a query, six filter sets, an era, a view, a
 * sort and the set of scans it has learnt are broken; a plain navigation threw
 * all of that away and returned you to the top of an unfiltered grid.
 */
export const revalidate = 3600;

/**
 * On demand, like the route it intercepts.
 *
 * This is the half that made the old arrangement expensive rather than merely
 * cautious: the same 1,603 ids were prerendered here as well, so every card in
 * the collection was built twice per deploy.
 */
export const dynamicParams = true;

/**
 * Every card, prerendered, exactly like the page it stands in for.
 *
 * Without this the dialog was the one dynamic route on /cards, and dynamic here
 * is not cheap: `owned()` below walks the whole collection, and the Notion query
 * behind it is a POST, which Next does not put in its fetch cache. So opening a
 * card meant a server render that re-read nineteen hundred rows out of Notion
 * before a single pixel of the dialog could be sent. That is the "it takes a
 * moment": it was not the animation, it was a database.
 *
 * The ids come from the same place the real route's do, so the two lists cannot
 * drift, and the build cost is one more render per card over data it has already
 * fetched and cached for that build.
 */
export async function generateStaticParams() {
  // Nothing up front, everything on demand.
  //
  // This used to list every id, and the reasoning was sound in the repo it came
  // from: there, a card page was indexed, and with dynamicParams on a
  // notFound() inside a revalidating segment answers 200 with the not-found
  // body — a soft 404, which is a real problem for a page a crawler reads.
  //
  // Neither half of that is true here. These pages are noindex and sit behind
  // middleware, so nothing crawls them and the only visitor who can reach a
  // bad id is the owner typing one. What the listing cost instead was 1,603
  // pages built twice — this route and the intercepting modal — for 175 MB and
  // most of the build, all of it for pages one person opens a handful of.
  //
  // ISR still caches each page for an hour after its first request, so the
  // second visitor pays nothing either way.
  return [];
}

async function owned(id: string): Promise<{ card: OwnedCard; setName: string } | null> {
  const sets = await getCards();
  for (const set of sets) {
    const card = set.cards.find((c) => c.tcgId === id);
    if (card) return { card, setName: set.name };
  }
  return null;
}

export default async function CardModalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // getCards() is memoised for the process, so asking a third time here costs
  // a map lookup rather than another walk of the collection.
  const [card, mine, sets] = await Promise.all([getCardDetail(id), owned(id), getCards()]);
  const { prev, next } = cardNeighbours(sets, id);
  if (!card) notFound();

  return (
    <CardModal label={card.name}>
      {/* h2: the page underneath still has its own h1, and the dialog is not a
          new document. */}
      <CardDetail card={card} mine={mine} heading="h2" nav={<CardNav prev={prev} next={next} />} />
    </CardModal>
  );
}

import { notFound } from "next/navigation";
import CardModal from "../../../components/CardModal";
import CardDetail from "../../../components/CardDetail";
import { getCardDetail, getCards, type OwnedCard } from "../../../../lib/core/cards";

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
 * The same refusal /cards/[id] makes, and for both of the same reasons.
 *
 * Written out at length there (app/cards/[id]/page.tsx, above its own copy of
 * this line): with dynamicParams on, the notFound() below returns HTTP 200 with
 * the not-found body, which is a soft 404, and any id not in the list falls into
 * exactly the dynamic render the comment underneath says was the bug. This route
 * had the expensive half of that problem documented and the line that prevents
 * it missing.
 */
export const dynamicParams = false;

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
  const sets = await getCards();
  return sets.flatMap((set) =>
    set.cards.flatMap((card) => (card.tcgId ? [{ id: card.tcgId }] : [])),
  );
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
  const [card, mine] = await Promise.all([getCardDetail(id), owned(id)]);
  if (!card) notFound();

  return (
    <CardModal label={card.name}>
      {/* h2: the page underneath still has its own h1, and the dialog is not a
          new document. */}
      <CardDetail card={card} mine={mine} heading="h2" />
    </CardModal>
  );
}

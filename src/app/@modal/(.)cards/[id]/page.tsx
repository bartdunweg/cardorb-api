import { notFound, redirect } from "next/navigation";
import CardModal from "./_components/CardModal";
import CardDetail from "@/features/collection/components/CardDetail";
import CardNav from "@/features/collection/components/CardNav";
import { cardNeighbours, getCardDetail, type OwnedCard } from "@/lib/core/cards";
import { currentViewer } from "@/lib/api/viewer";
import { getCards } from "@/lib/core/collection";
import "@/styles/poke-holo.css";

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

/**
 * Per request, like the route it intercepts, and for the same reason: it
 * renders `owned(id)`, which is a question about who is asking, and an ISR
 * entry keyed by path alone would answer it once for everybody. The longer
 * version of that argument is on app/cards/[id]/page.tsx.
 *
 * Two things this file used to say are worth recording as no longer true. It
 * prerendered all 1,603 ids, which meant every card in the collection was built
 * twice per deploy — once here and once on the real route — for 175 MB and most
 * of the build time, on pages one person opens a handful of. And the reason
 * given for that was that a dynamic dialog is expensive, because `owned()`
 * walked the whole collection and the Notion query behind it is a POST, which
 * Next does not put in its fetch cache: opening a card meant re-reading
 * nineteen hundred rows before a single pixel could be sent. That was the "it
 * takes a moment", and it was not the animation.
 *
 * Neither holds now. The rows are cached per person and the catalogue is cached
 * for everybody (lib/core/collection.ts, lib/core/catalogue.ts), so what a
 * dynamic render pays for is the join.
 */
export const dynamic = "force-dynamic";
export const dynamicParams = true;

async function owned(
  id: string,
  userId: string,
): Promise<{ card: OwnedCard; setName: string } | null> {
  const sets = await getCards(userId);
  for (const set of sets) {
    const card = set.cards.find((c) => c.tcgId === id);
    if (card) return { card, setName: set.name };
  }
  return null;
}

export default async function CardModalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // getCards() is cached per request, so asking a third time here costs
  // a map lookup rather than another walk of the collection.
  // The lock, not the proxy. proxy.ts only checks that a session cookie is
  // present; this is where it is verified, and it has to happen before the
  // collection is asked for, because the collection is now a question about a
  // person rather than a thing the deployment has.
  const viewer = await currentViewer();
  if (!viewer) redirect(`/login?next=/cards/${encodeURIComponent(id)}`);

  const [card, mine, sets] = await Promise.all([
    getCardDetail(id),
    owned(id, viewer.userId),
    getCards(viewer.userId),
  ]);
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

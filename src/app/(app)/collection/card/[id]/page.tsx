import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "@untitledui-pro/icons/line";
import CardDetail from "@/components/shared/CardDetail";
import CardNav from "@/components/shared/CardNav";
import Button from "@/components/shared/Button";
import { cardNeighbours, getCardDetail, type OwnedCard } from "@/lib/core/cards";
import { currentViewer } from "@/lib/api/viewer";
import { getCards } from "@/lib/core/collection";
import "@/styles/poke-holo.css";

/**
 * One card, in full — inside the (app) shell.
 *
 * The same data and the same CardDetail component as /cards/[id] (that route
 * is untouched: an old link or bookmark to it still works), but reached from
 * the collection grid now so the sidebar and navbar stay on screen instead of
 * a card opening onto a bare page outside the shell. See ADR for the "on
 * desktop this should really just be a page" instruction this answers — no
 * dialog here at all, on any width; CollectionScreen.tsx passes this route as
 * CardsView's basePath specifically so a click lands here rather than on
 * /cards/[id].
 *
 * Per request, not cached — same reasoning as /cards/[id]/page.tsx: this
 * renders `owned(id)`, a question about who is asking, and a cached entry
 * keyed by path alone would answer it once for everybody.
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = await getCardDetail(id);
  if (!card) return {};
  const where = card.set ? ` from ${card.set.name}` : "";
  const description = `${card.name}${where}${
    card.rarity ? `, ${card.rarity.toLowerCase()}` : ""
  }${card.illustrator ? `, illustrated by ${card.illustrator}` : ""}.`;
  return {
    title: card.set ? `${card.name} (${card.set.name})` : card.name,
    description,
  };
}

export default async function CollectionCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await currentViewer();
  if (!viewer) redirect(`/login?next=/collection/card/${encodeURIComponent(id)}`);

  const [card, mine, sets] = await Promise.all([
    getCardDetail(id),
    owned(id, viewer.userId),
    getCards(viewer.userId),
  ]);
  const { prev, next } = cardNeighbours(sets, id);
  if (!card) notFound();

  return (
    // No Card wrapper: this already sits inside the (app) shell next to the
    // sidebar, and a bordered/shadowed card of its own there reads as a card
    // inside a card. /cards/[id]/page.tsx (outside the shell) still wants
    // one; this route does not.
    <div className="flex flex-col items-start">
      <Button href="/collection" icon={ChevronLeft} iconPosition="left" color="tertiary">
        Collection
      </Button>

      <CardDetail
        card={card}
        mine={mine}
        nav={<CardNav prev={prev} next={next} basePath="/collection/card" />}
      />
    </div>
  );
}

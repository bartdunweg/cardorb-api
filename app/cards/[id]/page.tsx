import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Card from "../../components/Card";
import CardDetail from "../../components/CardDetail";
import Button from "../../components/Button";
import { ChevronLeft } from "lucide-react";
import { getCardDetail, getCards, type OwnedCard } from "../../../lib/core/cards";

/**
 * One card, in full.
 *
 * Every card is prerendered and nothing outside the collection resolves, which
 * is not the cheap option but is the only correct one: with dynamicParams on,
 * notFound() inside a revalidating segment answers 200 with the not-found page
 * in the body (a soft 404, measured) and the same trap the articles route
 * documents. Listing the ids makes the router itself refuse an unknown card.
 *
 * The cost is bounded by getCards() being walked once per build rather than
 * once per page, and by every TCGdex call being fetch-cached for a day.
 */
export const dynamicParams = false;
export const revalidate = 3600;
export async function generateStaticParams() {
  const sets = await getCards();
  return sets.flatMap((set) =>
    set.cards.flatMap((card) => (card.tcgId ? [{ id: card.tcgId }] : [])),
  );
}

/** The Notion side: which printings are held, and what the collection calls it. */
async function owned(id: string): Promise<{ card: OwnedCard; setName: string } | null> {
  const sets = await getCards();
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
    // Qualified by the set, because the name alone is not unique and the tab
    // title is what a search result shows. "Pikachu" has been printed dozens of
    // times, and dozens of these pages were shipping the identical title and a
    // description that differed only in its last clause.
    title: card.set ? `${card.name} (${card.set.name})` : card.name,
    description,
  };
}

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [card, mine] = await Promise.all([getCardDetail(id), owned(id)]);
  if (!card) notFound();

  return (
    <section className="page-card">
      {/* The portfolio built a Product node with the market price here, plus a
          breadcrumb. Both are search-engine markup and this app ships noindex,
          so they came out with the rest of the JSON-LD. */}
      <Card className="card-detail">
        <Button href="/cards" icon={ChevronLeft} iconPosition="left" className="btn--back">
          Cards
        </Button>

        <CardDetail card={card} mine={mine} />
      </Card>
    </section>
  );
}

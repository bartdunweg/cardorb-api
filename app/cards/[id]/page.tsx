import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Card from "../../components/Card";
import CardDetail from "../../components/CardDetail";
import Button from "../../components/Button";
import { ChevronLeft } from "lucide-react";
import CardNav from "../../components/CardNav";
import { cardNeighbours, getCardDetail, getCards, type OwnedCard } from "../../../lib/core/cards";
import "../../styles/collection.css";

/**
 * One card, in full.
 *
 * Rendered on demand and cached for an hour after. This route used to prerender
 * every card in the collection, and the argument for it — that a soft 404 is a
 * real problem — was inherited from a repo where these pages were indexed. Here
 * they are noindex and behind middleware. See generateStaticParams below for
 * what that listing actually cost.
 */
export const dynamicParams = true;
/**
 * Cached for an hour after the first request.
 *
 * A missing card answers 200 with the not-found page in the body — a soft 404,
 * and it is not fixed here. Two things were tried: rendering per request
 * instead of caching, and adding the root not-found boundary that was missing.
 * Neither changed the status, because app/cards/loading.tsx makes this route
 * stream: the headers are on their way before the component gets far enough to
 * call notFound().
 *
 * Left as it is, deliberately. The only thing a wrong status costs is a
 * crawler's understanding, and this route is noindex and behind middleware, so
 * nothing crawls it and the only visitor who can reach a bad id is the owner
 * mistyping one — who gets a page that says Not found. The alternative was
 * prerendering all 1,603 ids so the router itself refuses unknown ones, which
 * is what this used to do, at 175 MB and most of the build time per deploy.
 *
 * If /cards is ever indexed, this is the trade to revisit, and the honest fix
 * is to resolve the id before the page begins streaming.
 */
export const revalidate = 3600;
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
  // getCards() is memoised for the process, so asking a third time here costs
  // a map lookup rather than another walk of the collection.
  const [card, mine, sets] = await Promise.all([getCardDetail(id), owned(id), getCards()]);
  const { prev, next } = cardNeighbours(sets, id);
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

        <CardDetail card={card} mine={mine} nav={<CardNav prev={prev} next={next} />} />
      </Card>
    </section>
  );
}

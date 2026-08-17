import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Card from "../../components/Card";
import CardDetail from "../../components/CardDetail";
import Button from "../../components/Button";
import { ChevronLeft } from "lucide-react";
import CardNav from "../../components/CardNav";
import { cardNeighbours, getCardDetail, type OwnedCard } from "../../../lib/core/cards";
import { currentViewer } from "../../../lib/api/viewer";
import { getCards } from "../../../lib/core/collection";
import "../../styles/collection.css";

/**
 * One card, in full.
 *
 * Rendered per request. This route used to prerender every card in the
 * collection, and the argument for it — that a soft 404 is a real problem — was
 * inherited from a repo where these pages were indexed. Here they are noindex
 * and behind the proxy, so the listing came out; then the hour of ISR that
 * replaced it came out too, for the reason below.
 */
export const dynamicParams = true;
/**
 * Rendered per request, not cached for an hour.
 *
 * It used to be `revalidate = 3600`, which was safe while there was one
 * collection and is not safe now. This page renders `owned(id)` — whether *you*
 * hold the card, and which of your printings — and an ISR entry is keyed by the
 * path alone. Two people asking for the same card would be asking two different
 * questions and getting one answer, whichever of them rendered it first.
 *
 * The cost is smaller than it looks, because the expensive half moved. The
 * catalogue is cached and shared (lib/core/catalogue.ts) and the rows are cached
 * per person (lib/core/collection.ts), so what a request pays for now is the
 * join, which is memory and milliseconds.
 *
 * A missing card answers 200 with the not-found page in the body — a soft 404,
 * and it is not fixed here. Two things were tried: rendering per request
 * instead of caching, and adding the root not-found boundary that was missing.
 * Neither changed the status. The cause named at the time was app/cards/loading.tsx
 * making this route stream — the headers on their way before the component gets
 * far enough to call notFound(). That file no longer exists and this route is
 * outside the (app) group, so it does not inherit that group's fallback either:
 * whatever is producing the soft 404 today has not been re-checked, and the
 * sentence above should not be read as a live diagnosis.
 *
 * Left as it is, deliberately. The only thing a wrong status costs is a
 * crawler's understanding, and this route is noindex and behind the proxy, so
 * nothing crawls it and the only visitor who can reach a bad id is the owner
 * mistyping one — who gets a page that says Not found. The alternative was
 * prerendering all 1,603 ids so the router itself refuses unknown ones, which
 * is what this used to do, at 175 MB and most of the build time per deploy.
 *
 * If /cards is ever indexed, this is the trade to revisit, and the honest fix
 * is to resolve the id before the page begins streaming.
 */
export const dynamic = "force-dynamic";
/**
 * Which printings this person holds, and what their collection calls the set.
 *
 * Takes the viewer rather than reaching for a default, and that is the whole of
 * what was wrong here. It used to call getCards() with nothing, which resolved
 * to the placeholder id the Notion reader uses, which Postgres could not parse
 * — so the query failed, the fail-soft catch returned an empty collection, and
 * this answered "you do not hold this card" to somebody holding 1,968 of them.
 * An empty collection is an ordinary-looking answer, which is why it went
 * unnoticed.
 */
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
  // getCards() is wrapped in React's cache(), so asking a third time inside one
  // render costs nothing. Per request rather than per process, which is the
  // whole of what changed: a memo the next request inherits is a memo the next
  // person inherits.
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
    <section className="max-w-[calc(var(--content-max)+2*var(--page-pad-x))] mx-auto [padding:0_var(--page-pad-x)_var(--page-pad-bottom)]">
      {/* The portfolio built a Product node with the market price here, plus a
          breadcrumb. Both are search-engine markup and this app ships noindex,
          so they came out with the rest of the JSON-LD. */}
      <Card className="flex flex-col items-start">
        <Button href="/cards" icon={ChevronLeft} iconPosition="left" className="btn--back">
          Cards
        </Button>

        <CardDetail card={card} mine={mine} nav={<CardNav prev={prev} next={next} />} />
      </Card>
    </section>
  );
}

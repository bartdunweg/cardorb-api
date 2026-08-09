import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CardsView from "../../components/CardsView";
import { getCards, stripPrices } from "../../../lib/core/cards";
import { PUBLIC_USERNAME } from "../../../lib/core/config";

/**
 * The link you hand to someone: the collection, to look at.
 *
 * Same component as /cards, same filters, same rail. Two things are different,
 * and only one of them is enforced here. The cards arrive with their prices
 * removed, which is what makes this page safe to share; `mode="public"` then
 * takes away the controls that would be left pointing at nothing.
 *
 * The username is in the URL because a page has to know whose collection it is
 * before it renders, and a setting in a browser cannot tell it that. There is
 * one name today and it comes from an environment variable, so this is the
 * shape of an account system without the substance of one. When there are real
 * users, the lookup below is the only thing in this file that changes.
 */

// An hour, the same as the collection's own memo. Nothing here depends on who
// is asking, so unlike /cards this can be cached and shared.
export const revalidate = 3600;

export async function generateStaticParams() {
  return [{ username: PUBLIC_USERNAME }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${username}'s collection`,
    description: `The Pokémon cards ${username} has collected, set by set.`,
    // The one part of this app that is meant to be found. Everything else is
    // noindex (see app/layout.tsx), because everything else is a tool; this is
    // the page whose entire purpose is being shown to someone.
    robots: { index: true, follow: true },
  };
}

export default async function PublicCollection({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  if (username !== PUBLIC_USERNAME) notFound();

  // Stripped before it is handed to a client component, so the prices are not
  // in the HTML and not in the props. See stripPrices in lib/core/cards.ts.
  const sets = stripPrices(await getCards());

  return (
    <section className="page-cards">
      <link rel="preconnect" href="https://assets.tcgdex.net" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://images.pokemontcg.io" crossOrigin="anonymous" />
      <CardsView sets={sets} mode="public" username={username} />
    </section>
  );
}

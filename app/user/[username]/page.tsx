import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CardsView from "../../components/CardsView";
import { forGrid, getCards, stripPrices } from "../../../lib/core/cards";
import { OWNER_NAME, PUBLIC_USERNAME } from "../../../lib/core/config";

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

/**
 * Roughly how big the collection is, for the description only.
 *
 * Written down rather than counted, because generateMetadata runs before the
 * page body and counting would mean a second walk of the collection for one
 * number in a sentence. "Over sixteen hundred" stays true through a lot of
 * packs; when it stops being true, this line is the thing to change.
 */
const SIZE_HINT = "Over sixteen hundred";

export async function generateStaticParams() {
  return [{ username: PUBLIC_USERNAME }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const title = `${OWNER_NAME}'s Pokémon card collection`;
  const description = `${SIZE_HINT} Pokémon cards, set by set, with what is still on the wishlist.`;
  const path = `/user/${username}`;

  return {
    title,
    description,
    // The one part of this app that is meant to be found. Everything else is
    // noindex (see app/layout.tsx), because everything else is a tool; this is
    // the page whose entire purpose is being shown to someone.
    robots: { index: true, follow: true },
    // Absolute, resolved against metadataBase. Without it this page has no
    // stated address, and a link shared with a tracking parameter on it becomes
    // a second URL for the same collection as far as a crawler is concerned.
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: "binder",
      title,
      description,
      locale: "en_GB",
    },
    // summary_large_image, because the card that gets drawn is the collection
    // and a 120px thumbnail of it says nothing.
    twitter: { card: "summary_large_image", title, description },
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
  const sets = forGrid(stripPrices(await getCards()));

  const held = sets.reduce((n, set) => n + set.cards.filter((c) => c.owned).length, 0);

  /**
   * What this page is, for a machine.
   *
   * The portfolio's graphs were dropped on the way over because this app was
   * noindex everywhere, and that reasoning ended at this route. A
   * CollectionPage with an ItemList of the sets is the honest description: a
   * page listing a collection, and the parts it is organised into. The sets are
   * the list rather than the cards — sixteen hundred ListItems would be a
   * hundred kilobytes of JSON describing what the HTML already says.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${OWNER_NAME}'s Pokémon card collection`,
    description: `${held} Pokémon cards, organised by set.`,
    inLanguage: "en",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: sets.length,
      itemListElement: sets.map((set, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: set.name,
      })),
    },
  };

  return (
    <section className="page-cards">
      <link rel="preconnect" href="https://assets.tcgdex.net" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://images.pokemontcg.io" crossOrigin="anonymous" />
      <script
        type="application/ld+json"
        // The data is ours and contains no user input: set names come from
        // Notion by way of TCGdex. The escape is for the one character that
        // would end the script element early regardless of where it came from.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <CardsView sets={sets} mode="public" username={username} />
    </section>
  );
}

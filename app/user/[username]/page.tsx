import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CardsView from "@/components/custom/CardsView";
import { forGrid, forPublic } from "../../../lib/core/cards";
import { getCards, ownerOf } from "../../../lib/core/collection";
import { collectionTitle, ownerLabel } from "../../../lib/core/owner";
import { APP_NAME } from "../../../lib/core/config";
import "../../styles/poke-holo.css";
import { pageCardsClassName } from "@/components/custom/cardsPageClasses";

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

/**
 * Rendered per request, and the expensive parts cached underneath it.
 *
 * This was `revalidate = 3600` on the reasoning that nothing here depends on
 * who is asking — true, and beside the point. What it depends on is whether the
 * owner still wants it shared, and that is a thing they can change. An ISR
 * entry survives its own subject: turn a collection private and the last public
 * render of it sits on disk, servable, for up to an hour after the switch. A
 * privacy control with an hour of lag is not a privacy control.
 *
 * The alternative was to remember to call revalidatePath() everywhere the flag
 * can change. That works right up until somebody adds a second place it can
 * change, which is exactly the kind of promise this file should not be built
 * on. Rendering per request removes the window rather than policing it.
 *
 * It is not the trade it would have been before the caching split. The rows are
 * cached per person and the catalogue is cached for everybody, so a request
 * here costs one lookup of whose page this is plus an in-memory join — not the
 * thirteen-second walk that made caching the whole page necessary in the first
 * place.
 */
export const dynamic = "force-dynamic";

/**
 * What this page is about, in one sentence, for every collection.
 *
 * There used to be a size in here — "Over sixteen hundred Pokémon cards" — from
 * a constant, written down rather than counted because generateMetadata runs
 * before the page body and counting would mean a second walk of the collection
 * for one number in a sentence. That reasoning still holds; what stopped
 * holding is the number, which was a fact about one person's binder printed on
 * everybody's page. The count is drawn in the OG image, where it is real.
 */
const DESCRIPTION = "A Pokémon card collection, set by set, with what is still on the wishlist.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  // The same lookup the page body does, collapsed into one by cache() in
  // ownerOf(). A profile that is private or absent gets no title worth
  // indexing; the body below is what actually answers 404.
  const owner = await ownerOf(username);
  if (!owner) return { title: "Collection not found", robots: { index: false, follow: false } };

  const title = collectionTitle(owner);
  const description = DESCRIPTION;
  const path = `/user/${username}`;

  return {
    title,
    description,
    // One of the two parts of this app that are meant to be found — the other
    // is the landing page at /. Everything else is noindex (see
    // app/layout.tsx), because everything else is a tool; this is the page
    // whose entire purpose is being shown to someone.
    robots: { index: true, follow: true },
    // Absolute, resolved against metadataBase. Without it this page has no
    // stated address, and a link shared with a tracking parameter on it becomes
    // a second URL for the same collection as far as a crawler is concerned.
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: APP_NAME,
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
  // The lookup this route's sibling predicted long before there was a table to
  // do it in. A private profile and a missing one give the same 404, so this
  // page cannot be used to ask whether a name is taken by somebody who would
  // rather not be found.
  const owner = await ownerOf(username);
  if (!owner) notFound();

  // Curated before it is handed to a client component, so neither the prices
  // nor the owner's own inventory — what they paid, condition, notes, how many
  // — are in the HTML or in the props. See forPublic in lib/core/cards.ts.
  const sets = forGrid(forPublic(await getCards(owner.id)));

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
    name: collectionTitle(owner),
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
    <section className={pageCardsClassName}>
      <link rel="preconnect" href="https://assets.tcgdex.net" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://images.pokemontcg.io" crossOrigin="anonymous" />
      <script
        type="application/ld+json"
        // This block now carries a name somebody typed into Settings, which it
        // did not when the name came from an env var — so the escape below is
        // load-bearing rather than belt-and-braces. `</` is the one sequence
        // that can end the script element early, and JSON.stringify will not
        // escape it on its own. The set names either side of it are still ours,
        // by way of TCGdex.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <CardsView sets={sets} variant="public" username={username} ownerName={ownerLabel(owner)} />
    </section>
  );
}

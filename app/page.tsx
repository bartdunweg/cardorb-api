import type { Metadata } from "next";
import Link from "next/link";
import { Layers, Search, Wallet } from "lucide-react";
import Card from "./components/Card";
import { APP_NAME, APP_TAGLINE, OWNER_NAME, PUBLIC_USERNAME, SITE_URL } from "../lib/core/config";

/**
 * The page this app hands to someone who has never seen it.
 *
 * There was none. / was the login, so the one address anyone would ever type or
 * share was a password field: nothing to read, nothing for a crawler to index,
 * and no answer to "what is this" for the person who followed the link. The
 * form moved to /login and this took its place.
 *
 * Everything else in this app is noindex, deliberately — it is one person's
 * collection tool, not a site. This page and /user/<name> are the two
 * exceptions, and they are different exceptions: that one is a collection worth
 * finding, this one is the name worth finding it by.
 *
 * Static. It reads no cookie, walks no collection and takes no parameter, so
 * there is nothing here to render per request; the numbers that would need a
 * Notion walk live on the public collection, one click away, and a landing page
 * that can be down because a database is slow is a bad trade for one figure.
 */

const SIGN_IN_HREF = "/login";
const DEMO_HREF = `/user/${PUBLIC_USERNAME}`;

export const metadata: Metadata = {
  // absolute, so the layout's "%s · Card Orb" template does not put the name
  // in twice on the one page that is mostly the name.
  title: { absolute: `${APP_NAME} — your Pokémon card collection, sorted` },
  description: APP_TAGLINE,
  // The layout says noindex for the whole app because the whole app is a tool.
  // This is the front of it, and the only page whose job is to be found.
  robots: { index: true, follow: true },
  // Absolute against metadataBase. Without it, one share with a tracking
  // parameter on the end becomes a second URL for the same page.
  alternates: { canonical: "/" },
  keywords: [
    "Pokémon card collection",
    "Pokémon TCG tracker",
    "card collection tracker",
    "Pokémon binder",
  ],
  openGraph: {
    type: "website",
    url: "/",
    siteName: APP_NAME,
    title: `${APP_NAME} — your Pokémon card collection, sorted`,
    description: APP_TAGLINE,
    locale: "en_GB",
  },
  twitter: { card: "summary_large_image", title: APP_NAME, description: APP_TAGLINE },
};

/**
 * The three things it actually does, which is the whole list.
 *
 * Written as what you get rather than what it has: "every set, in order" is a
 * thing you can picture and "set management" is not. Three, because a fourth
 * would have to be invented — this is a tool with a small honest surface and
 * padding the list is how a landing page starts lying.
 */
const FEATURES = [
  {
    icon: Layers,
    title: "Every set, in order",
    body: "Your cards laid out set by set, oldest era first, the way a binder actually runs — with the gaps still showing.",
  },
  {
    icon: Wallet,
    title: "What it is worth",
    body: "Prices ride along with each card, so the collection's total is a number you can look at rather than one you guess at.",
  },
  {
    icon: Search,
    title: "Find one card",
    body: "Filter by set, rarity, type or era, or search the name. Including the ones you do not have yet, which is the wishlist.",
  },
];

export default function Home() {
  /**
   * What this page is, for a machine.
   *
   * A WebApplication rather than a WebSite: the thing being described is the
   * tool, and the name and the one-line description are exactly what a search
   * result has room for anyway. The demo is named as a part of it, because a
   * crawler arriving here should be told the collection exists — it is the page
   * worth indexing and this is the only link to it.
   *
   * No aggregateRating, no offers, no invented numbers. Structured data that
   * claims things the page does not is the kind that gets a site ignored.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: APP_NAME,
    description: APP_TAGLINE,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    inLanguage: "en",
    // Absolute. metadataBase resolves the relative paths in the metadata object
    // above, but it has no reach into a script tag: "/" in JSON-LD is a URL
    // that identifies nothing, and a graph whose subject has no address is a
    // graph about no particular thing.
    url: `${SITE_URL}/`,
    author: { "@type": "Person", name: OWNER_NAME },
  };

  return (
    <section className="page-landing">
      <script
        type="application/ld+json"
        // No user input anywhere in the object above: it is four constants and
        // a name from the environment. The escape is for the one character that
        // would end the script element early regardless of where it came from.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <header className="landing-hero">
        {/* The name, small and above the headline rather than as the headline.
            An <h1> that is just a product name spends the one heading a page
            gets on a word nobody searched for; the name is right here to be
            recognised, and the h1 below says what the thing does. */}
        <p className="landing-wordmark">{APP_NAME}</p>
        <h1 className="landing-title">
          Your Pokémon card collection,
          {/* A hard break, not a wrapped line: the two halves are the two
              halves of the sentence and breaking anywhere else reads worse at
              every width. It collapses to one line on a wide screen anyway. */}
          <br />
          sorted.
        </h1>
        <p className="landing-lede">{APP_TAGLINE}</p>

        {/* The two ways forward, in the order they matter. Sign in is filled
            because it is what this page is for; the demo is the same size and
            unfilled, because it is the honest option for everyone who cannot
            sign in — which, today, is everybody but one person. */}
        <div className="landing-actions">
          <Link href={SIGN_IN_HREF} className="btn btn--primary landing-action">
            Sign in
          </Link>
          <Link href={DEMO_HREF} className="btn landing-action">
            See a real collection
          </Link>
        </div>
        <p className="landing-note">
          No account yet — {OWNER_NAME}&rsquo;s collection is public, and it is the same screen.
        </p>
      </header>

      <ul className="landing-features">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title}>
            <Card className="landing-feature">
              {/* aria-hidden: the heading beside it says the same thing in
                  words, and an icon announced as "layers" before it is noise. */}
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              <h2 className="landing-feature-title">{title}</h2>
              <p className="landing-feature-body">{body}</p>
            </Card>
          </li>
        ))}
      </ul>

      <footer className="landing-footer">
        <p>
          Built for one collection, and open to look at:{" "}
          <Link href={DEMO_HREF}>{OWNER_NAME}&rsquo;s cards</Link>.
        </p>
      </footer>
    </section>
  );
}

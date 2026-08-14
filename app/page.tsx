import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Check, Layers, Search, Share2, Wallet } from "lucide-react";
import Card from "./components/Card";
import { APP_NAME, APP_TAGLINE, OWNER_NAME, PUBLIC_USERNAME, SITE_URL } from "../lib/core/config";

const SIGN_IN_HREF = "/login";
const DEMO_HREF = `/user/${PUBLIC_USERNAME}`;

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME} — your Pokémon card collection, sorted` },
  description: APP_TAGLINE,
  robots: { index: true, follow: true },
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

const FEATURES = [
  {
    icon: Layers,
    title: "Every set has its place",
    body: "Keep your cards in the order a binder makes sense: by set, era and the gaps you are still looking for.",
  },
  {
    icon: Wallet,
    title: "Value without the guesswork",
    body: "Cardmarket prices in euros travel with your cards, so the total is always there when you want to see it.",
  },
  {
    icon: Search,
    title: "The card you mean, quickly",
    body: "Search by name or narrow by set, rarity, type and era — whether it is owned or still on the wishlist.",
  },
];

const PREVIEW_CARDS = [
  "/landing/collection-preview/base-set-001.webp",
  "/landing/collection-preview/base-set-004.webp",
  "/landing/collection-preview/base-set-006.webp",
  "/landing/collection-preview/base-set-025.webp",
];

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: APP_NAME,
    description: APP_TAGLINE,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    inLanguage: "en",
    url: `${SITE_URL}/`,
    author: { "@type": "Person", name: OWNER_NAME },
  };

  return (
    <section className="page-landing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <nav className="landing-nav" aria-label="Primary navigation">
        <Link href="/" className="landing-brand" aria-label={`${APP_NAME} home`}>
          {APP_NAME}
        </Link>
        <div className="landing-nav-links">
          <a href="#organise">How it works</a>
          <a href="#share">Public collections</a>
        </div>
        <Link href={SIGN_IN_HREF} className="landing-nav-signin">
          Sign in
        </Link>
      </nav>

      <header className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Made for the collector, not the spreadsheet.</p>
          <h1 className="landing-title">Your Pokémon card collection, in its proper place.</h1>
          <p className="landing-lede">
            Track every card set by set, see what it is worth, and keep the next one in view.
          </p>
          <div className="landing-actions">
            <Link href="/signup" className="btn btn--primary landing-action">
              Start your collection
              <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
            </Link>
            <Link href={DEMO_HREF} className="btn landing-action">
              Explore a real collection
            </Link>
          </div>
          <p className="landing-note">
            Completely free. Already collecting? <Link href={SIGN_IN_HREF}>Sign in</Link>.
          </p>
        </div>

        <Link
          href={DEMO_HREF}
          className="landing-preview"
          aria-label={`Explore ${OWNER_NAME}'s public collection`}
        >
          <span className="landing-preview-bar">
            <span className="landing-preview-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>cardorb.com/user/{PUBLIC_USERNAME}</span>
            <ArrowUpRight size={15} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="landing-preview-body">
            <span className="landing-preview-intro">
              <span className="landing-preview-kicker">Public collection</span>
              <strong>{OWNER_NAME}&rsquo;s binder</strong>
              <span>1,600+ cards, held and wanted.</span>
            </span>
            <span className="landing-preview-stats" aria-hidden="true">
              <span>
                <b>1,600+</b>
                cards
              </span>
              <span>
                <b>Set by set</b>
                organised
              </span>
            </span>
            <span className="landing-preview-cards" aria-hidden="true">
              {PREVIEW_CARDS.map((src, index) => (
                <Image
                  key={src}
                  src={src}
                  alt=""
                  width={245}
                  height={337}
                  sizes="(max-width: 800px) 20vw, 12vw"
                  priority={index === 0}
                />
              ))}
            </span>
          </span>
          <span className="landing-preview-caption">
            A live Card Orb collection, captured for this preview.
          </span>
        </Link>
      </header>

      <section className="landing-intro" aria-labelledby="landing-intro-title">
        <p className="landing-eyebrow">The collection, considered</p>
        <h2 id="landing-intro-title">A better home for the cards you care about.</h2>
        <p>
          Card Orb turns the information around a collection into something you can actually enjoy
          using — clean enough for the everyday, detailed enough for the long haul.
        </p>
      </section>

      <section
        id="organise"
        className="landing-section landing-section--features"
        aria-labelledby="features-title"
      >
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Built around the binder</p>
          <h2 id="features-title">Know what you have. Notice what is missing.</h2>
        </div>
        <ul className="landing-features" role="list">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Card className="landing-feature">
                <span className="landing-feature-icon">
                  <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-workflow" aria-labelledby="workflow-title">
        <div className="landing-workflow-copy">
          <p className="landing-eyebrow">A calmer way to collect</p>
          <h2 id="workflow-title">The details stay connected.</h2>
          <p>
            A card belongs to a set, an era and a story. Card Orb keeps that context close, so the
            next session starts exactly where the last one ended.
          </p>
          <ul role="list">
            <li>
              <Check size={17} strokeWidth={2} aria-hidden="true" />
              Track owned cards and your wishlist together.
            </li>
            <li>
              <Check size={17} strokeWidth={2} aria-hidden="true" />
              Move naturally between the overview, sets and Pokédex.
            </li>
            <li>
              <Check size={17} strokeWidth={2} aria-hidden="true" />
              Keep collection value visible without making it the point.
            </li>
          </ul>
        </div>
        <Card className="landing-workflow-card">
          <span className="landing-workflow-card-icon">
            <BookOpen size={22} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="landing-workflow-number">01</span>
          <h3>From the first card to the last gap.</h3>
          <p>
            One collection view for the cards already in the binder and the cards still waiting to
            find their way there.
          </p>
          <span className="landing-workflow-rule" aria-hidden="true" />
          <span className="landing-workflow-label">Your collection, in order</span>
        </Card>
      </section>

      <section id="share" className="landing-share" aria-labelledby="share-title">
        <div>
          <p className="landing-eyebrow">Share, on your terms</p>
          <h2 id="share-title">A collection worth showing can have its own address.</h2>
          <p>
            Turn on a public collection when you want to share it. It is a clean link to the cards —
            not your value data, and never a profile you did not choose to make public.
          </p>
          <Link href={DEMO_HREF} className="landing-inline-link">
            See how a public collection looks{" "}
            <ArrowUpRight size={16} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
        <div className="landing-share-link">
          <span className="landing-share-link-icon">
            <Share2 size={20} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span>
            <small>Your collection link</small>
            <strong>cardorb.com/user/yourname</strong>
          </span>
        </div>
      </section>

      <section className="landing-closing" aria-labelledby="closing-title">
        <p className="landing-eyebrow">Make room for the next one</p>
        <h2 id="closing-title">Start with the collection you have.</h2>
        <p>It is completely free, takes a moment to set up, and grows with every card you add.</p>
        <Link href="/signup" className="btn btn--primary landing-action">
          Create your free collection
          <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </section>

      <footer className="landing-footer">
        <span>{APP_NAME}</span>
        <p>Prices come from Cardmarket, in euros — the market collectors recognise.</p>
        <Link href={DEMO_HREF}>Explore {OWNER_NAME}&rsquo;s collection</Link>
      </footer>
    </section>
  );
}

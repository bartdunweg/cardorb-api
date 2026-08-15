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

  // Shared recipes, each used by several elements below — kept as named
  // strings rather than components since every consumer is on this one page.
  const eyebrow =
    "m-0 text-label-tertiary [font-family:var(--font-main)] [font-size:var(--fs-eyebrow)] " +
    "[font-weight:var(--fw-eyebrow)] tracking-[0.08em] uppercase";
  const sectionHeading =
    "m-0 text-label [font-family:var(--font-main)] [font-weight:var(--fw-title)] " +
    "tracking-[-0.045em] leading-[0.98] [font-size:var(--fs-display)]";
  const sectionBody =
    "m-0 text-label-secondary [font-family:var(--font-body)] [font-size:var(--fs-body-l)] leading-relaxed";
  const featureIcon =
    "inline-grid w-[42px] h-[42px] place-items-center border border-[var(--color-border-subtle)] rounded-full text-label";
  const cardHeading =
    "mt-1 mb-0 text-label [font-family:var(--font-main)] [font-weight:var(--fw-title)] " +
    "tracking-[-0.03em] [line-height:var(--lh-snug)] [font-size:var(--fs-sub)]";
  const cardBody = "m-0 text-label-secondary [font-family:var(--font-body)] [font-size:var(--fs-body)] leading-normal";

  return (
    <section className="w-[min(100%,1180px)] mx-auto overflow-hidden [padding:var(--space-6)_var(--page-pad-x)_var(--page-pad-bottom)] [@media(max-width:640px)]:pt-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <nav
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 min-h-[var(--control-h)]
          [@media(max-width:640px)]:grid-cols-[1fr_auto]"
        aria-label="Primary navigation"
      >
        <Link
          href="/"
          className="text-label [font-family:var(--font-main)] [font-size:var(--fs-label)] [font-weight:var(--fw-button)] tracking-[-0.03em] no-underline"
          aria-label={`${APP_NAME} home`}
        >
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-5 [@media(max-width:640px)]:hidden">
          <a
            href="#organise"
            className="text-label-secondary [font-family:var(--font-body)] [font-size:var(--fs-small)] no-underline [transition:color_var(--dur-fast)_var(--ease-smooth)] hover:text-label"
          >
            How it works
          </a>
          <a
            href="#share"
            className="text-label-secondary [font-family:var(--font-body)] [font-size:var(--fs-small)] no-underline [transition:color_var(--dur-fast)_var(--ease-smooth)] hover:text-label"
          >
            Public collections
          </a>
        </div>
        <Link href={SIGN_IN_HREF} className="justify-self-end">
          Sign in
        </Link>
      </nav>

      <header
        className="grid grid-cols-[minmax(0,0.88fr)_minmax(440px,1.12fr)] items-center [gap:clamp(var(--space-10),7vw,88px)]
          min-h-[620px] [padding-block:clamp(72px,10vw,128px)]
          [@media(max-width:800px)]:grid-cols-1 [@media(max-width:800px)]:gap-10 [@media(max-width:800px)]:min-h-0
          [@media(max-width:800px)]:[padding-block:88px_96px]"
      >
        <div className="flex flex-col items-start gap-5 [@media(max-width:800px)]:items-center [@media(max-width:800px)]:text-center">
          <p className={eyebrow}>Made for the collector, not the spreadsheet.</p>
          <h1
            className="max-w-[9ch] [font-size:clamp(42px,4.5vw,64px)] m-0 text-label [font-family:var(--font-main)]
              [font-weight:var(--fw-title)] tracking-[-0.045em] leading-[0.98]
              [@media(max-width:800px)]:max-w-[12ch] [@media(max-width:640px)]:[font-size:clamp(40px,12vw,52px)]"
          >
            Your Pokémon card collection, in its proper place.
          </h1>
          <p className={`max-w-[34ch] ${sectionBody}`}>
            Track every card set by set, see what it is worth, and keep the next one in view.
          </p>
          <div className="flex flex-wrap gap-3 mt-2 [@media(max-width:640px)]:w-full [@media(max-width:640px)]:flex-col">
            <Link
              href="/signup"
              className="btn btn--primary justify-center min-w-[178px] [@media(max-width:640px)]:self-stretch"
            >
              Start your collection
              <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
            </Link>
            <Link
              href={DEMO_HREF}
              className="btn justify-center min-w-[178px] [@media(max-width:640px)]:self-stretch"
            >
              Explore a real collection
            </Link>
          </div>
          <p className="m-0 text-label-tertiary [font-family:var(--font-body)] [font-size:var(--fs-small)]">
            Completely free. Already collecting?{" "}
            <Link href={SIGN_IN_HREF} className="text-inherit underline [text-underline-offset:3px]">
              Sign in
            </Link>
            .
          </p>
        </div>

        <Link
          href={DEMO_HREF}
          aria-label={`Explore ${OWNER_NAME}'s public collection`}
          className="relative block min-w-0 overflow-hidden border border-[var(--glass-border)] rounded-lg
            bg-[var(--glass-bg-solid)] [box-shadow:var(--shadow-elevated)] text-inherit no-underline
            [transform:rotate(1.5deg)] [transition:transform_var(--dur-normal)_var(--ease-smooth),box-shadow_var(--dur-normal)_var(--ease-smooth)]
            hover:[transform:rotate(0deg)_translateY(-4px)]
            hover:[box-shadow:0_0_0_1px_color-mix(in_srgb,var(--color-label)_10%,transparent),var(--shadow-elevated)]
            before:absolute before:z-[1] before:inset-0 before:pointer-events-none before:content-['']
            before:[background:linear-gradient(120deg,color-mix(in_srgb,var(--color-bg-surface)_74%,transparent),transparent_45%)]
            [@media(max-width:800px)]:w-[min(100%,600px)] [@media(max-width:800px)]:mx-auto
            [@media(max-width:640px)]:[transform:none]"
        >
          <span
            className="relative z-[2] flex items-center gap-2 min-h-[42px] px-4
              border-b border-[var(--color-border-subtle)] text-label-tertiary
              [font-family:var(--font-body)] [font-size:var(--fs-tiny)] [&>svg]:ml-auto"
          >
            <span className="inline-flex gap-[5px]" aria-hidden="true">
              <i className="w-[6px] h-[6px] rounded-full bg-[var(--color-border-active)]" />
              <i className="w-[6px] h-[6px] rounded-full bg-[var(--color-border-active)]" />
              <i className="w-[6px] h-[6px] rounded-full bg-[var(--color-border-active)]" />
            </span>
            <span>cardorb.com/user/{PUBLIC_USERNAME}</span>
            <ArrowUpRight size={15} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span
            className="relative z-[2] grid grid-cols-[1fr_auto] gap-8 min-h-[420px] [padding:clamp(var(--space-5),4vw,var(--space-8))]
              [@media(max-width:640px)]:min-h-[360px] [@media(max-width:640px)]:gap-5"
          >
            <span className="flex flex-col items-start gap-2">
              <span className="text-label-tertiary [font-family:var(--font-body)] [font-size:var(--fs-small)]">
                Public collection
              </span>
              <strong className="text-label [font-family:var(--font-main)] [font-size:var(--fs-card)] [font-weight:var(--fw-title)] tracking-[-0.035em]">
                {OWNER_NAME}&rsquo;s binder
              </strong>
              <span className="text-label-tertiary [font-family:var(--font-body)] [font-size:var(--fs-small)]">
                1,600+ cards, held and wanted.
              </span>
            </span>
            <span
              className="flex gap-5 [@media(max-width:640px)]:gap-3"
              aria-hidden="true"
            >
              <span className="flex flex-col gap-1">
                <b className="text-label [font-family:var(--font-main)] [font-size:var(--fs-body)] [font-weight:var(--fw-title)]">
                  1,600+
                </b>
                <span className="text-label-tertiary [font-family:var(--font-body)] [font-size:var(--fs-small)]">
                  cards
                </span>
              </span>
              <span className="flex flex-col gap-1">
                <b className="text-label [font-family:var(--font-main)] [font-size:var(--fs-body)] [font-weight:var(--fw-title)]">
                  Set by set
                </b>
                <span className="text-label-tertiary [font-family:var(--font-body)] [font-size:var(--fs-small)]">
                  organised
                </span>
              </span>
            </span>
            <span
              className="col-span-full self-end grid grid-cols-4 items-end [gap:clamp(6px,1.2vw,var(--space-3))]
                [padding-inline:clamp(var(--space-2),2vw,var(--space-5))] [@media(max-width:640px)]:px-0"
              aria-hidden="true"
            >
              {PREVIEW_CARDS.map((src, index) => (
                <Image
                  key={src}
                  src={src}
                  alt=""
                  width={245}
                  height={337}
                  sizes="(max-width: 800px) 20vw, 12vw"
                  priority={index === 0}
                  className={`w-full h-auto rounded-xs [box-shadow:var(--shadow-card)] ${
                    index === 1 || index === 3 ? "translate-y-[var(--space-4)]" : ""
                  }`}
                />
              ))}
            </span>
          </span>
          <span
            className="relative z-[2] block px-4 py-3 border-t border-[var(--color-border-subtle)]
              text-label-tertiary [font-family:var(--font-body)] [font-size:var(--fs-tiny)]"
          >
            A live Card Orb collection, captured for this preview.
          </span>
        </Link>
      </header>

      <section
        className="mx-auto max-w-[670px] text-center [padding-block:clamp(96px,12vw,160px)] [@media(max-width:640px)]:[padding-block:96px]"
        aria-labelledby="landing-intro-title"
      >
        <p className={eyebrow}>The collection, considered</p>
        <h2 id="landing-intro-title" className={sectionHeading}>
          A better home for the cards you care about.
        </h2>
        <p className={`max-w-[57ch] mx-auto mt-5 ${sectionBody}`}>
          Card Orb turns the information around a collection into something you can actually enjoy
          using — clean enough for the everyday, detailed enough for the long haul.
        </p>
      </section>

      <section id="organise" className="mx-auto max-w-[1040px]" aria-labelledby="features-title">
        <div className="max-w-[600px] mb-8">
          <p className={`mb-4 ${eyebrow}`}>Built around the binder</p>
          <h2 id="features-title" className={sectionHeading}>
            Know what you have. Notice what is missing.
          </h2>
        </div>
        <ul
          className="grid grid-cols-3 gap-4 m-0 p-0 list-none [@media(max-width:800px)]:grid-cols-1"
          role="list"
        >
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex">
              <Card className="flex flex-1 flex-col items-start gap-3">
                <span className={featureIcon}>
                  <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <h3 className={cardHeading}>{title}</h3>
                <p className={cardBody}>{body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="mx-auto grid grid-cols-[minmax(0,0.85fr)_minmax(330px,0.7fr)] items-center [gap:clamp(var(--space-10),10vw,140px)]
          max-w-[960px] [padding-block:clamp(104px,14vw,180px)]
          [@media(max-width:800px)]:grid-cols-1 [@media(max-width:800px)]:gap-8"
        aria-labelledby="workflow-title"
      >
        <div>
          <p className={eyebrow}>A calmer way to collect</p>
          <h2 id="workflow-title" className={sectionHeading}>
            The details stay connected.
          </h2>
          <p className={`mt-5 ${sectionBody}`}>
            A card belongs to a set, an era and a story. Card Orb keeps that context close, so the
            next session starts exactly where the last one ended.
          </p>
          <ul className="grid gap-3 mt-6 mb-0 p-0 list-none" role="list">
            <li className="flex gap-3 items-start text-label-secondary [font-family:var(--font-body)] [font-size:var(--fs-body)] leading-normal">
              <Check size={17} strokeWidth={2} aria-hidden="true" className="flex-none mt-[2px] text-label" />
              Track owned cards and your wishlist together.
            </li>
            <li className="flex gap-3 items-start text-label-secondary [font-family:var(--font-body)] [font-size:var(--fs-body)] leading-normal">
              <Check size={17} strokeWidth={2} aria-hidden="true" className="flex-none mt-[2px] text-label" />
              Move naturally between the overview, sets and Pokédex.
            </li>
            <li className="flex gap-3 items-start text-label-secondary [font-family:var(--font-body)] [font-size:var(--fs-body)] leading-normal">
              <Check size={17} strokeWidth={2} aria-hidden="true" className="flex-none mt-[2px] text-label" />
              Keep collection value visible without making it the point.
            </li>
          </ul>
        </div>
        <Card
          className="relative min-h-[430px] [padding:clamp(var(--space-6),4vw,var(--space-10))]
            [@media(max-width:640px)]:min-h-[370px]"
        >
          <span className={featureIcon}>
            <BookOpen size={22} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="absolute top-8 right-8 text-label-tertiary [font-family:var(--font-main)] [font-size:var(--fs-small)]">
            01
          </span>
          <h3 className={`max-w-[11ch] mt-8 [font-size:var(--fs-card)] ${cardHeading}`}>
            From the first card to the last gap.
          </h3>
          <p className={`max-w-[28ch] mt-4 ${cardBody}`}>
            One collection view for the cards already in the binder and the cards still waiting to
            find their way there.
          </p>
          {/* --color-timeline used to live here and was removed with the portfolio's
              timeline, which this dashed rule is not: it is the connector on the
              workflow card and it is still on screen. --color-border-active is the
              same colour by another name — rgba(0,0,0,.16) resolves to #d6d6d6 on
              white where the old token was #d7d7d7 — so this is the value restored
              rather than a new one chosen. */}
          <span
            aria-hidden="true"
            className="absolute right-8 bottom-[78px] left-8 h-px
              [background:repeating-linear-gradient(90deg,var(--color-border-active)_0_4px,transparent_4px_10px)]"
          />
          <span className="absolute bottom-8 left-8 text-label-tertiary [font-family:var(--font-body)] [font-size:var(--fs-small)]">
            Your collection, in order
          </span>
        </Card>
      </section>

      <section
        id="share"
        className="mx-auto grid grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)] items-center [gap:clamp(var(--space-8),9vw,128px)]
          max-w-[1040px] [padding:clamp(var(--space-8),7vw,88px)] rounded-lg bg-[color-mix(in_srgb,var(--color-label)_4%,transparent)]
          [@media(max-width:800px)]:grid-cols-1
          [@media(max-width:640px)]:mx-[calc(-1*var(--space-2))] [@media(max-width:640px)]:p-6"
        aria-labelledby="share-title"
      >
        <div>
          <p className={eyebrow}>Share, on your terms</p>
          <h2 id="share-title" className={`max-w-[12ch] ${sectionHeading}`}>
            A collection worth showing can have its own address.
          </h2>
          <p className={`mt-5 ${sectionBody}`}>
            Turn on a public collection when you want to share it. It is a clean link to the cards —
            not your value data, and never a profile you did not choose to make public.
          </p>
          <Link
            href={DEMO_HREF}
            className="inline-flex items-center gap-2 mt-6 text-label [font-family:var(--font-main)]
              [font-size:var(--fs-body)] [font-weight:var(--fw-button)] no-underline
              hover:underline hover:[text-underline-offset:3px]"
          >
            See how a public collection looks{" "}
            <ArrowUpRight size={16} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
        <div
          className="flex gap-4 items-center p-5 border border-[var(--glass-border)] rounded-md
            bg-[var(--glass-bg)] [box-shadow:var(--shadow-card)]
            [@media(max-width:800px)]:max-w-[430px]"
        >
          <span className={featureIcon}>
            <Share2 size={20} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="grid gap-1 min-w-0">
            <small className="text-label-tertiary [font-family:var(--font-body)] [font-size:var(--fs-small)]">
              Your collection link
            </small>
            <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-label [font-family:var(--font-main)] [font-size:var(--fs-body)] [font-weight:var(--fw-title)] tracking-[-0.02em]">
              cardorb.com/user/yourname
            </strong>
          </span>
        </div>
      </section>

      <section
        className="flex flex-col items-center mx-auto max-w-[680px] text-center
          [padding-block:clamp(112px,15vw,200px)]"
        aria-labelledby="closing-title"
      >
        <p className={eyebrow}>Make room for the next one</p>
        <h2 id="closing-title" className={`max-w-[12ch] ${sectionHeading}`}>
          Start with the collection you have.
        </h2>
        <p className={`max-w-[42ch] mt-5 ${sectionBody}`}>
          It is completely free, takes a moment to set up, and grows with every card you add.
        </p>
        <Link href="/signup" className="btn btn--primary mt-6">
          Create your free collection
          <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </section>

      <footer
        className="grid grid-cols-[1fr_minmax(0,1.6fr)_1fr] gap-4 items-start pt-5
          border-t border-[var(--color-border-subtle)] text-label-tertiary
          [font-family:var(--font-body)] [font-size:var(--fs-small)]
          [@media(max-width:640px)]:grid-cols-1 [@media(max-width:640px)]:text-center"
      >
        <span className="text-label [font-family:var(--font-main)] [font-size:var(--fs-label)] [font-weight:var(--fw-button)] tracking-[-0.03em] no-underline">
          {APP_NAME}
        </span>
        <p className="m-0 text-center">Prices come from Cardmarket, in euros — the market collectors recognise.</p>
        <Link
          href={DEMO_HREF}
          className="justify-self-end text-inherit underline [text-underline-offset:3px] [@media(max-width:640px)]:justify-self-center"
        >
          Explore {OWNER_NAME}&rsquo;s collection
        </Link>
      </footer>
    </section>
  );
}

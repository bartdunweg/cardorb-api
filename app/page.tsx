import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
import {
  ArrowUpRight,
  BookOpen01,
  Camera01,
  Check,
  Download01,
  LayersThree01,
  Phone01,
  Plus,
  SearchLg,
  Share01,
  TrendUp01,
  Wallet01,
} from "@untitledui/icons";
import Card from "@/components/custom/Card";
import MarketingFooter from "@/components/custom/MarketingFooter";
import Navbar from "@/components/custom/Navbar";
import MarketingViewerSlot from "@/components/custom/MarketingViewerSlot";
// ThemeToggle moved with the footer into MarketingFooter.
import {
  cardBody,
  cardHeading,
  eyebrow,
  featureIcon,
  navLink,
  sectionBody,
  sectionHeading,
} from "@/components/custom/marketingClasses";
import { APP_NAME, APP_TAGLINE, APP_TITLE, SITE_URL } from "../lib/core/config";

const DASHBOARD_HREF = "/dashboard";

export const metadata: Metadata = {
  title: { absolute: APP_TITLE },
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
    title: APP_TITLE,
    description: APP_TAGLINE,
    locale: "en_GB",
  },
  twitter: { card: "summary_large_image", title: APP_TITLE, description: APP_TAGLINE },
};

/**
 * Facts about the app, not about anybody's collection.
 *
 * "1,600+ cards tracked" used to sit first here. It was the size of the
 * deployment owner's binder, printed as though it were a product number —
 * true of one person and of nothing else, and it read as a demo collection
 * being shown off. What is left is what the app does for whoever signs up.
 */
const STATS = [
  { value: "No limit", label: "cards per collection" },
  { value: "3", label: "catalogues matched" },
  { value: "Cardmarket, live", label: "pricing" },
];

/**
 * Written when this page was one person's collection with a signup attached,
 * and rewritten when it stopped being that. There is no demo collection here
 * and no showcase account: every collection belongs to whoever made it, some
 * of them are public because their owner turned the link on, and the copy is
 * not allowed to imply otherwise. "Can I track my own collection too?" was the
 * clearest tell — "too" alongside somebody else's.
 */
const FAQ = [
  {
    q: "Is Card Orb really free to use?",
    a: "Yes. There is no paid tier, no card limit and no credit card at signup — free is the only plan there is.",
  },
  {
    q: "Can other people see my cards?",
    a: "Only if you turn on a public link, and only the cards — what your collection is worth stays yours.",
  },
  {
    q: "Where do the prices come from?",
    a: "Cardmarket, in euros, kept current as the market moves.",
  },
  {
    // The landing page's way in to /privacy. The footer links there too, but a
    // footer is where a link goes to not be read; somebody deciding whether to
    // hand over an email address is deciding it here, among the other three
    // questions they have. It also fills the fourth cell of a two-column grid
    // that had been running with three.
    q: "What happens to my data?",
    a: (
      <>
        No advertising, no tracking and nothing sold. Delete your account and the whole collection
        goes with it, straight away. The{" "}
        <Link
          href="/privacy"
          className="text-primary underline underline-offset-2 transition-colors duration-150 ease-out hover:text-secondary"
        >
          privacy policy
        </Link>{" "}
        says exactly what is stored and who else sees it.
      </>
    ),
  },
];

const FEATURES = [
  {
    icon: LayersThree01,
    title: "Every set has its place",
    body: "Keep your cards in the order a binder makes sense: by set, era and the gaps you are still looking for.",
  },
  {
    icon: Wallet01,
    title: "Value without the guesswork",
    body: "Cardmarket prices in euros travel with your cards, so the total is always there when you want to see it.",
  },
  {
    icon: SearchLg,
    title: "The card you mean, quickly",
    body: "Search by name or narrow by set, rarity, type and era — whether it is owned or still on the wishlist.",
  },
  {
    icon: Plus,
    title: "Add a card in seconds",
    body: "Type a name, pick the print, and it is in the binder — no barcode and no hunting through menus.",
  },
  {
    icon: BookOpen01,
    title: "Every Pokémon, indexed",
    body: "A living Pokédex beside the binder: what is owned for each Pokémon, and what is still missing.",
  },
  {
    icon: TrendUp01,
    title: "Value over time",
    body: "Every snapshot of the collection's worth is kept, so you can see the total move, not just where it stands.",
  },
  {
    icon: Camera01,
    title: "Scan to add, on the way",
    body: "Point a phone at a card and let it find the match.",
    comingSoon: "iOS & Android",
  },
  {
    icon: Download01,
    title: "Take it with you",
    body: "Export the whole collection to CSV whenever you want it outside Card Orb.",
    comingSoon: true,
  },
];

export default function Home() {
  // No `await currentViewer()` here, and that is the whole point: reading a
  // cookie at the top of this component made the page impossible to render
  // statically. Whoever is signed in is now MarketingViewerSlot's business,
  // behind a Suspense boundary — see that file for the measurement.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: APP_NAME,
    description: APP_TAGLINE,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    inLanguage: "en",
    url: `${SITE_URL}/`,
    // The product's publisher, not a person. `author: Person` named whoever the
    // deployment was configured for, which described the collections rather
    // than the app and stopped being true of either once there were accounts.
    publisher: { "@type": "Organization", name: APP_NAME },
  };

  // The shared recipes live in ./components/marketingClasses now — they were
  // local consts here while this was the only page in this visual language,
  // and /app/ios ended that.

  return (
    // The layout reserves room at the top for a floating tab bar this route
    // does not have — see SigninShell.tsx, which cancels it the same way.
    // Navbar sits outside the padded/max-width section below so it can go
    // sticky and full-bleed (its own inner wrapper re-applies the 1180px cap);
    // nested inside that section it would inherit the max-width and stick at
    // 1180px wide floating in the middle of a wider viewport instead of
    // spanning it.
    <div className="-mt-[var(--main-pad-top)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <Navbar
        center={
          <>
            {/* #how-it-works, not #organise. This said "How it works" and
                jumped to the Features section, because that is where the id
                was; the section this names had none at all. The only link to
                #organise was this one, so the id moved rather than the copy. */}
            <a href="#how-it-works" className={navLink}>
              How it works
            </a>
            <a href="#share" className={navLink}>
              {/* "Public collections" read as a directory of other people's
                  collections to browse. There is no such directory: the
                  section it jumps to is about turning your own link on. */}
              Sharing
            </a>
            <Link href="/app/ios" className={navLink}>
              iPhone app
            </Link>
            <a href="#faq" className={navLink}>
              FAQ
            </a>
          </>
        }
        right={<MarketingViewerSlot dashboardHref={DASHBOARD_HREF} />}
      />

      <section className="w-[min(100%,1180px)] mx-auto overflow-hidden [padding:0_var(--page-pad-x)_var(--page-pad-bottom)]">
        <header
          className="flex flex-col items-center gap-5 text-center mx-auto max-w-[640px]
          min-h-[480px] justify-center [padding-block:clamp(72px,10vw,128px)]"
        >
          {/* A badge that stated a fact and then stopped. It said "iOS & Android
            — coming soon" and was an inert <span>, so the one question it
            raised — what app, and when — had nowhere to go. It is a link to
            /app/ios now, and names only the platform that has a page. */}
          <Link href="/app/ios" className="mb-2 no-underline">
            {/* Badge rather than BadgeWithIcon: that one takes icon
                *components*, and this page is a server component, so a function
                cannot cross into a client one. The icons are children here and
                the pill lays them out the same way. */}
            <Badge type="pill-color" color="gray" size="md" className="gap-1.5">
              <Phone01 size={13} strokeWidth={1.8} aria-hidden="true" />
              The iPhone app is on its way
              <ArrowUpRight size={13} strokeWidth={1.8} aria-hidden="true" />
            </Badge>
          </Link>
          <h1
            className="max-w-[14ch] mx-auto [font-size:clamp(42px,4.5vw,64px)] m-0 text-primary font-body
            font-medium tracking-[-0.045em] leading-tight
            [@media(max-width:640px)]:[font-size:clamp(40px,12vw,52px)]"
          >
            Track your Pokémon card collection.
          </h1>
          <p className={`max-w-[34ch] mx-auto ${sectionBody}`}>
            See every set, what it is worth, and what is still missing.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-2 [@media(max-width:640px)]:w-full [@media(max-width:640px)]:flex-col">
            <Button
              href="/signup"
              size="lg"
              className="min-w-[178px] [@media(max-width:640px)]:self-stretch"
            >
              Start your collection
            </Button>
          </div>
          <ul
            className="flex flex-wrap justify-center gap-x-8 gap-y-3 mt-4 m-0 p-0 list-none"
            role="list"
          >
            {STATS.map(({ value, label }) => (
              <li key={label} className="flex flex-col items-center gap-0.5">
                <b className="text-primary font-body text-sm font-medium">{value}</b>
                <span className="text-tertiary font-body text-xs">{label}</span>
              </li>
            ))}
          </ul>
        </header>

        <section
          className="mx-auto max-w-[670px] text-center [padding-block:clamp(96px,12vw,160px)] [@media(max-width:640px)]:[padding-block:96px]"
          aria-labelledby="landing-intro-title"
        >
          <p className={`${eyebrow} mb-4`}>What it does</p>
          <h2 id="landing-intro-title" className={sectionHeading}>
            A clear view of your collection.
          </h2>
          <p className={`max-w-[57ch] mx-auto mt-5 ${sectionBody}`}>
            Card Orb shows what you own, what it is worth, and what is missing — without a
            spreadsheet.
          </p>
        </section>

        <section
          className="mx-auto max-w-[1040px] [padding-block:clamp(104px,14vw,180px)]"
          aria-labelledby="features-title"
        >
          <div className="max-w-[600px] mb-8">
            <p className={`${eyebrow} mb-4`}>Features</p>
            <h2 id="features-title" className={sectionHeading}>
              Know what you have. Notice what is missing.
            </h2>
          </div>
          <ul
            className="grid grid-cols-3 gap-4 m-0 p-0 list-none [@media(max-width:800px)]:grid-cols-1"
            role="list"
          >
            {FEATURES.map(({ icon: Icon, title, body, comingSoon }) => (
              <li key={title} className="flex">
                <Card className="flex flex-1 flex-col items-start gap-3">
                  <span className="flex items-center justify-between w-full">
                    <span className={featureIcon}>
                      <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
                    </span>
                    {comingSoon && (
                      <span
                        className="text-tertiary font-body text-xs
                        uppercase tracking-[0.06em]"
                      >
                        Coming soon{typeof comingSoon === "string" ? ` · ${comingSoon}` : ""}
                      </span>
                    )}
                  </span>
                  <h3 className={cardHeading}>{title}</h3>
                  <p className={cardBody}>{body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="how-it-works"
          className="mx-auto grid grid-cols-[minmax(0,0.85fr)_minmax(330px,0.7fr)] items-center [gap:clamp(calc(var(--spacing)*10),10vw,140px)]
          max-w-[960px] [padding-block:clamp(104px,14vw,180px)]
          [@media(max-width:800px)]:grid-cols-1 [@media(max-width:800px)]:gap-8"
          aria-labelledby="workflow-title"
        >
          <div>
            <p className={`${eyebrow} mb-4`}>How it works</p>
            <h2 id="workflow-title" className={sectionHeading}>
              Everything in one place.
            </h2>
            <p className={`mt-5 ${sectionBody}`}>
              Every card stays linked to its set and era, so the next session picks up exactly where
              the last one left off.
            </p>
            <ul className="grid gap-3 mt-6 mb-0 p-0 list-none" role="list">
              <li className="flex gap-3 items-start text-secondary font-body text-sm leading-normal">
                <Check
                  size={17}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="flex-none mt-[2px] text-primary"
                />
                Owned cards and your wishlist, in one view.
              </li>
              <li className="flex gap-3 items-start text-secondary font-body text-sm leading-normal">
                <Check
                  size={17}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="flex-none mt-[2px] text-primary"
                />
                Move between the overview, sets and Pokédex.
              </li>
              <li className="flex gap-3 items-start text-secondary font-body text-sm leading-normal">
                <Check
                  size={17}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="flex-none mt-[2px] text-primary"
                />
                Collection value, visible but not the focus.
              </li>
            </ul>
          </div>
          <Card
            className="relative min-h-[430px] [padding:clamp(calc(var(--spacing)*6),4vw,calc(var(--spacing)*10))]
            [@media(max-width:640px)]:min-h-[370px]"
          >
            <span className={featureIcon}>
              <BookOpen01 size={22} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className="absolute top-8 right-8 text-tertiary font-body text-xs">01</span>
            <h3 className={`max-w-[13ch] mt-8 text-display-xs ${cardHeading}`}>
              Every card, tracked.
            </h3>
            <p className={`max-w-[28ch] mt-4 ${cardBody}`}>
              One view for the cards you own and the cards on your wishlist.
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
              [background:repeating-linear-gradient(90deg,light-dark(rgba(0,0,0,0.16),rgba(255,255,255,0.16))_0_4px,transparent_4px_10px)]"
            />
            <span className="absolute bottom-8 left-8 text-tertiary font-body text-xs">
              Your collection, in order
            </span>
          </Card>
        </section>

        <section
          id="share"
          className="mx-auto grid grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)] items-center [gap:clamp(calc(var(--spacing)*8),9vw,128px)]
          max-w-[1040px] [padding:clamp(calc(var(--spacing)*8),7vw,88px)] rounded-orb-lg bg-secondary
          [@media(max-width:800px)]:grid-cols-1
          [@media(max-width:640px)]:-mx-2 [@media(max-width:640px)]:p-6"
          aria-labelledby="share-title"
        >
          <div>
            <p className={`${eyebrow} mb-4`}>Sharing</p>
            <h2 id="share-title" className={`max-w-[15ch] ${sectionHeading}`}>
              Share a public link to your collection.
            </h2>
            <p className={`mt-5 ${sectionBody}`}>
              Turn it on when you want to share it. A clean link to the cards — not your value data,
              and never a profile you did not choose to make public.
            </p>
          </div>
          <div
            className="flex gap-4 items-center p-5 border border-secondary rounded-orb-md
            bg-primary shadow-xs
            [@media(max-width:800px)]:max-w-[430px]"
          >
            <span className={featureIcon}>
              <Share01 size={20} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className="grid gap-1 min-w-0">
              <small className="text-tertiary font-body text-xs">Your collection link</small>
              <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-primary font-body text-sm font-medium tracking-[-0.02em]">
                cardorb.com/user/yourname
              </strong>
            </span>
          </div>
        </section>

        <section
          id="faq"
          className="mx-auto max-w-[1040px] [padding-block:clamp(112px,15vw,200px)]"
          aria-labelledby="faq-title"
        >
          <div className="max-w-[600px] mb-8">
            <p className={`${eyebrow} mb-4`}>Before you start</p>
            <h2 id="faq-title" className={sectionHeading}>
              A few things worth knowing.
            </h2>
          </div>
          <ul
            className="grid grid-cols-2 gap-4 m-0 p-0 list-none [@media(max-width:800px)]:grid-cols-1"
            role="list"
          >
            {FAQ.map(({ q, a }) => (
              <li key={q} className="flex">
                <Card className="flex flex-1 flex-col items-start gap-2">
                  <h3 className={`${cardHeading} mt-0`}>{q}</h3>
                  <p className={cardBody}>{a}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="flex flex-col items-center mx-auto max-w-[680px] text-center
          [padding-block:clamp(112px,15vw,200px)]"
          aria-labelledby="closing-title"
        >
          <p className={`${eyebrow} mb-4`}>Get started</p>
          <h2 id="closing-title" className={`max-w-[22ch] ${sectionHeading}`}>
            Start with the collection you have.
          </h2>
          <p className={`max-w-[42ch] mt-5 ${sectionBody}`}>
            Free, no credit card, takes a minute to set up.
          </p>
          {/* self-center: .btn sets align-self: flex-start for toolbars, which
            beats this column's items-center and left-pins the one button that
            is not inside its own centering wrapper (the hero's is). */}
          <Button
            href="/signup"
            size="lg"
            className="self-center mt-6"
            iconTrailing={
              <ArrowUpRight data-icon="trailing" size={17} strokeWidth={1.8} aria-hidden />
            }
          >
            Create your free collection
          </Button>
        </section>

        <MarketingFooter />
      </section>
    </div>
  );
}

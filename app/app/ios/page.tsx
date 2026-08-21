import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Camera,
  Check,
  Download,
  Layers,
  RefreshCw,
  Search,
  Smartphone,
  Wallet,
} from "lucide-react";
import Card from "../../components/Card";
import MarketingFooter from "../../components/MarketingFooter";
import Navbar from "../../components/Navbar";
import ViewerPill from "../../components/ViewerPill";
import {
  cardBody,
  cardHeading,
  eyebrow,
  featureIcon,
  navLink,
  sectionBody,
  sectionHeading,
} from "../../components/marketingClasses";
import { APP_NAME, SITE_URL } from "../../../lib/core/config";
import { currentViewer } from "../../../lib/api/viewer";
import { ownerLabel } from "../../../lib/core/owner";

const SIGN_IN_HREF = "/login";
const DASHBOARD_HREF = "/dashboard";

const TITLE = `${APP_NAME} for iPhone`;
const DESCRIPTION =
  "The Card Orb iPhone app: your whole Pokémon card collection, its value in euros, and what is still missing — in your pocket.";

export const metadata: Metadata = {
  // The root layout defaults every route to noindex. This page is one of the
  // three that opts back in, so it says so here rather than inheriting.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: "/app/ios" },
  keywords: [
    "Pokémon card app",
    "Pokémon TCG iPhone app",
    "card collection app iOS",
    "Pokémon collection tracker iPhone",
  ],
  openGraph: {
    type: "website",
    url: "/app/ios",
    siteName: APP_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_GB",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/**
 * What the app does, and only what it does.
 *
 * Every line here is something this repo's API already answers for — the
 * collection and wishlist (/api/v1/collection), per-variant inventory
 * (decision 0008), the catalogue you do not own yet (/api/v1/catalog/sets,
 * decision 0037), Cardmarket value, value over time (/api/v1/value-history).
 * The one unshipped thing is marked as unshipped, the same way the landing
 * page marks it. A feature list for an app nobody can download yet is very
 * easy to write and very hard to walk back.
 */
const FEATURES = [
  {
    icon: Layers,
    title: "Your binder, in order",
    body: "Every set and era the way you keep them, with the gaps you are still looking for right where they belong.",
  },
  {
    icon: Search,
    title: "Find a card standing up",
    body: "Search by name, or narrow by set, rarity and type — one hand, at a table, mid-trade.",
  },
  {
    icon: Wallet,
    title: "What it is worth, in euros",
    body: "Cardmarket prices travel with the cards, so the total is there when somebody asks.",
  },
  {
    icon: BookOpen,
    title: "The whole catalogue",
    body: "Browse a set you do not own a single card from, and see at a glance which ones you already have.",
  },
  {
    icon: RefreshCw,
    title: "Nothing to sync by hand",
    body: "Add a card on the phone and it is on the web. One collection, not two that need reconciling.",
  },
  {
    icon: Camera,
    title: "Scan to add",
    body: "Point the camera at a card and let it find the match.",
    comingSoon: true,
  },
];

/**
 * Placeholder slots. Filling them in later means swapping the dashed frame
 * for a next/image with a src from public/app/ios/ — the frame, the caption
 * and the layout around them do not move.
 */
const SHOTS = [
  { label: "Collection", caption: "Every card you own, by set." },
  { label: "Card", caption: "One card, every variant and its price." },
  { label: "Browse", caption: "A whole set, owned and missing." },
];

const REQUIREMENTS = [
  { term: "Device", detail: "iPhone" },
  { term: "Price", detail: "Free, no subscription" },
  { term: "Account", detail: "The same one as the web" },
  { term: "Currency", detail: "Euros, from Cardmarket" },
];

const FAQ = [
  {
    q: "When can I download it?",
    a: "There is no date to give yet, and a made-up one would be worse than none. This page is where the download button will appear.",
  },
  {
    q: "Will the app cost anything?",
    a: "No. Card Orb is free on the web and the app is the same collection on a smaller screen — there is no paid tier to move you onto.",
  },
  {
    q: "Do I need an account first?",
    a: "Yes, and you can make one now. Everything you add on the web today is already what the app will open on.",
  },
  {
    q: "Is there an Android version?",
    a: "It is planned, and it does not have a page yet. iPhone is the one being built first.",
  },
];

export default async function IosApp() {
  const viewer = await currentViewer();
  const viewerName = viewer ? ownerLabel(viewer) : "";

  /**
   * SoftwareApplication, with no `offers`, no `downloadUrl` and no
   * `aggregateRating` — deliberately. Those three are what a search engine
   * reads as "this is available, at this price, and people rate it", and none
   * of that is true yet. Markup is the one place a hedge in the copy does not
   * reach, so the hedge has to be the absence of the property.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: TITLE,
    description: DESCRIPTION,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "iOS",
    inLanguage: "en",
    url: `${SITE_URL}/app/ios`,
    publisher: { "@type": "Organization", name: APP_NAME },
  };

  return (
    // Same as the landing page: the layout reserves room at the top for a
    // floating tab bar this route does not have, and Navbar sits outside the
    // capped section so it can go sticky and full-bleed.
    <div className="-mt-[var(--main-pad-top)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <Navbar
        center={
          <>
            <a href="#features" className={navLink}>
              What it does
            </a>
            <a href="#sync" className={navLink}>
              Sync
            </a>
            <a href="#faq" className={navLink}>
              FAQ
            </a>
          </>
        }
        right={
          viewer ? (
            <ViewerPill href={DASHBOARD_HREF} name={viewerName} avatarUrl={viewer.avatarUrl} />
          ) : (
            <>
              <Link href={SIGN_IN_HREF} className={navLink}>
                Log in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2.5 text-md font-semibold bg-brand-solid text-white shadow-xs-skeuomorphic ring-1 ring-transparent ring-inset hover:bg-brand-solid_hover no-underline"
              >
                Sign up
              </Link>
            </>
          )
        }
      />

      <section className="w-[min(100%,1180px)] mx-auto overflow-hidden [padding:0_var(--page-pad-x)_var(--page-pad-bottom)]">
        <header
          className="flex flex-col items-center gap-5 text-center mx-auto max-w-[660px]
            [padding-block:clamp(64px,9vw,112px)]"
        >
          <span
            className="inline-flex items-center gap-2 mb-2 px-3 py-2 rounded-full
              border border-[var(--color-border-subtle)] text-tertiary
              [font-family:var(--font-body)] [font-size:var(--fs-tiny)]"
          >
            <Smartphone size={13} strokeWidth={1.8} aria-hidden="true" />
            In development
          </span>
          <h1
            className="max-w-[15ch] mx-auto [font-size:clamp(42px,4.5vw,64px)] m-0 text-primary [font-family:var(--font-main)]
              [font-weight:var(--fw-title)] tracking-[-0.045em] [line-height:var(--lh-tight)]
              [@media(max-width:640px)]:[font-size:clamp(40px,12vw,52px)]"
          >
            Your collection, in your pocket.
          </h1>
          <p className={`max-w-[42ch] mx-auto ${sectionBody}`}>
            {APP_NAME} for iPhone is the same collection you keep on the web — every set, every
            price, every gap — at the table where you actually trade.
          </p>

          <div className="flex flex-col items-center gap-3 mt-2 [@media(max-width:640px)]:w-full">
            {/*
              A button that does nothing, and says so.

              Not `disabled`: that takes it out of the tab order, and a control
              nobody can reach is a control that never gets to explain itself —
              the case components/Button.tsx documents. It stays focusable,
              announces its state through aria-disabled, and points at the note
              below through aria-describedby. It is a plain <button> rather
              than <Button> because that component only renders a real button
              when handed an onClick, and there is nothing to hand it.

              When the app ships, this becomes a <Button href external> and the
              note goes.
            */}
            <button
              type="button"
              aria-disabled="true"
              aria-describedby="ios-download-note"
              /* self-center: .btn sets align-self: flex-start for toolbars,
                 which beats this column's items-center and would left-pin
                 both of these buttons. */
              className="inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2.5 text-md font-semibold bg-brand-solid text-white shadow-xs-skeuomorphic ring-1 ring-transparent ring-inset hover:bg-brand-solid_hover no-underline self-center min-w-[240px] [@media(max-width:640px)]:w-full"
            >
              <Download size={17} strokeWidth={1.8} aria-hidden="true" />
              Download on the App Store
            </button>
            <p
              id="ios-download-note"
              className="m-0 max-w-[38ch] text-tertiary [font-family:var(--font-body)] [font-size:var(--fs-small)]"
            >
              Not on the App Store yet. This is where the download will be.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2.5 text-md font-semibold bg-primary text-secondary shadow-xs-skeuomorphic ring-1 ring-primary ring-inset hover:bg-primary_hover no-underline self-center [@media(max-width:640px)]:w-full"
            >
              Start on the web
              <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </div>
        </header>

        <section className="[padding-block:clamp(40px,6vw,72px)]" aria-labelledby="shots-title">
          <h2 id="shots-title" className="sr-only">
            What the app looks like
          </h2>
          <ul
            className="grid grid-cols-3 gap-6 m-0 p-0 mx-auto max-w-[840px] list-none
              [@media(max-width:800px)]:grid-cols-1 [@media(max-width:800px)]:max-w-[280px]"
            role="list"
          >
            {SHOTS.map(({ label, caption }) => (
              <li key={label} className="flex flex-col items-center gap-3">
                {/* Placeholder, on purpose and visibly so. A stock phone
                    mock-up of a screen the app does not have yet would be a
                    picture of a promise. */}
                <div
                  className="grid place-items-center w-full aspect-[9/19]
                    rounded-[28px] border border-dashed border-[var(--color-border-active)]
                    bg-[color-mix(in_srgb,var(--color-label)_3%,transparent)]
                    text-tertiary [font-family:var(--font-main)] [font-size:var(--fs-small)]"
                  aria-hidden="true"
                >
                  {label}
                </div>
                <p className={`text-center ${cardBody} [font-size:var(--fs-small)]`}>{caption}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="features"
          className="mx-auto max-w-[1040px] [padding-block:clamp(96px,13vw,168px)]"
          aria-labelledby="ios-features-title"
        >
          <div className="max-w-[600px] mb-8">
            <p className={`${eyebrow} mb-4`}>What it does</p>
            <h2 id="ios-features-title" className={sectionHeading}>
              Everything the web has, where you are.
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
                        className="text-tertiary [font-family:var(--font-body)] [font-size:var(--fs-tiny)]
                          uppercase tracking-[0.06em]"
                      >
                        Coming soon
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
          id="sync"
          className="mx-auto grid grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)] items-center [gap:clamp(var(--space-8),9vw,128px)]
            max-w-[1040px] [padding:clamp(var(--space-8),7vw,88px)] rounded-orb-lg bg-[color-mix(in_srgb,var(--color-label)_4%,transparent)]
            [@media(max-width:800px)]:grid-cols-1
            [@media(max-width:640px)]:-mx-2 [@media(max-width:640px)]:p-6"
          aria-labelledby="ios-sync-title"
        >
          <div>
            <p className={`${eyebrow} mb-4`}>One collection</p>
            <h2 id="ios-sync-title" className={`max-w-[16ch] ${sectionHeading}`}>
              The phone and the web read the same binder.
            </h2>
            <p className={`mt-5 ${sectionBody}`}>
              There is no import, no export and no second copy to keep straight. Both open the
              collection on your account, so a card added on the sofa is there on the laptop.
            </p>
            <ul className="grid gap-3 mt-6 mb-0 p-0 list-none" role="list">
              <li className={`flex gap-3 items-start ${cardBody}`}>
                <Check
                  size={17}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="flex-none mt-[2px] text-primary"
                />
                One account, both places.
              </li>
              <li className={`flex gap-3 items-start ${cardBody}`}>
                <Check
                  size={17}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="flex-none mt-[2px] text-primary"
                />
                Owned cards and wishlist, together.
              </li>
              <li className={`flex gap-3 items-start ${cardBody}`}>
                <Check
                  size={17}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="flex-none mt-[2px] text-primary"
                />
                Your public link works the same from either.
              </li>
            </ul>
          </div>
          <dl
            className="grid gap-4 p-5 m-0 border border-secondary rounded-orb-md
              bg-primary [box-shadow:var(--shadow-card)]
              [@media(max-width:800px)]:max-w-[430px]"
          >
            {REQUIREMENTS.map(({ term, detail }) => (
              <div key={term} className="grid gap-1">
                <dt className="text-tertiary [font-family:var(--font-body)] [font-size:var(--fs-small)]">
                  {term}
                </dt>
                <dd className="m-0 text-primary [font-family:var(--font-main)] [font-size:var(--fs-body)] [font-weight:var(--fw-title)] tracking-[-0.02em]">
                  {detail}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          id="faq"
          className="mx-auto max-w-[1040px] [padding-block:clamp(104px,14vw,180px)]"
          aria-labelledby="ios-faq-title"
        >
          <div className="max-w-[600px] mb-8">
            <p className={`${eyebrow} mb-4`}>Before you ask</p>
            <h2 id="ios-faq-title" className={sectionHeading}>
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
            [padding-block:clamp(104px,14vw,180px)]"
          aria-labelledby="ios-closing-title"
        >
          <p className={`${eyebrow} mb-4`}>Get a head start</p>
          <h2 id="ios-closing-title" className={`max-w-[22ch] ${sectionHeading}`}>
            Build the collection now. Open it on your phone later.
          </h2>
          <p className={`max-w-[44ch] mt-5 ${sectionBody}`}>
            Free, no credit card, takes a minute to set up — and the app opens on whatever you have
            already added.
          </p>
          {/* self-center: .btn sets align-self: flex-start for toolbars, which
              beats this column's items-center. */}
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2.5 text-md font-semibold bg-brand-solid text-white shadow-xs-skeuomorphic ring-1 ring-transparent ring-inset hover:bg-brand-solid_hover no-underline self-center mt-6"
          >
            Create your free collection
            <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </section>

        <MarketingFooter />
      </section>
    </div>
  );
}

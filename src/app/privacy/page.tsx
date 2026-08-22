import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { legal, legalList as list } from "@/components/shared/LegalPage";
import { APP_NAME } from "@/lib/core/config";
import { SITE_OG_IMAGE } from "@/lib/core/og";

/**
 * The privacy policy, at a URL, because that is the only form it can take.
 *
 * App Store Connect asks for a link rather than a document, so this had to be a
 * route in the web app before the iOS app could be submitted at all. It is one
 * of the five public, indexable pages here — see app/layout.tsx, which noindexes
 * everything else, and `grep -rn "index: true" app/` for the authoritative list.
 *
 * One policy for both surfaces, not one per surface — see
 * git history. Where the website
 * and the app genuinely differ (analytics, crash reporting) the difference is
 * named in the sentence rather than split into a second document that would
 * describe the same accounts and the same database and drift from this one.
 *
 * Written against what this repo actually does, not from memory: the analytics
 * line is app/layout.tsx's <Analytics />, the "no crash reporting on the web"
 * line is instrumentation.ts's onRequestError, the deletion paragraph is
 * app/api/v1/account/route.ts, and the "a public collection has no prices in it"
 * claim is the one with a test behind it
 * (app/api/v1/public/[username]/cards/[tcgId]/route.test.ts).
 */

/** The date in the page's own "Last updated" line. One constant, two readers:
 *  the visible line and the <time> element's machine-readable attribute, so
 *  they cannot disagree the way two hand-typed dates would. */
const UPDATED = { iso: "2026-08-16", human: "16 August 2026" };

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${APP_NAME} stores about you, why, who else sees it, and how to get rid of it.`,
  // Both required. The root layout sets robots: { index: false } for the whole
  // site on purpose (app/layout.tsx) — almost every route here is a tool behind
  // a password. A legal page that App Store Connect links to is the opposite of
  // that, so it opts back in explicitly, the same way / and /user/<name> do.
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
  openGraph: {
    type: "article",
    url: "/privacy",
    siteName: APP_NAME,
    title: `Privacy · ${APP_NAME}`,
    locale: "en_GB",
    // Named explicitly, and it has to be. `openGraph` is replaced by a child
    // segment rather than merged into, so declaring one here dropped the
    // og:image that app/opengraph-image.tsx gives every other route — this page
    // rendered with no picture and a twitter:card that fell back to "summary",
    // while / and /login both had one. / does not hit this because it sits in
    // the same segment as the image file. Anything that declares openGraph in a
    // nested route from now on has the same hole — and /app/ios then did fall
    // into it, which is why the image is a shared constant now rather than a
    // string each page has to remember to repeat.
    images: [SITE_OG_IMAGE],
  },
  twitter: { card: "summary_large_image", title: `Privacy · ${APP_NAME}` },
};

const { h2, h3, body, link, strong } = legal;

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated={UPDATED}>
      <p className={`${body} mt-6`}>
        {APP_NAME} is a tool for keeping track of a Pokémon card collection. This policy explains
        what it stores, why, who else sees it, and what you can do about it. It covers both the
        website at cardorb.com and the {APP_NAME} app for iPhone and iPad — they are one service,
        sharing one account and one database. Where the two genuinely differ, it says so.
      </p>

      <h2 className={h2}>Who is responsible</h2>
      <p className={body}>
        {APP_NAME} is operated by BADU Ventures B.V., Voorhaven 27C, 3025 HC Rotterdam, the
        Netherlands, registered with the Dutch Chamber of Commerce under KVK number 76480801. BADU
        Ventures B.V. is the data controller for everything described here.
      </p>
      <p className={body}>
        For anything in this policy, including a request about your own data, write to{" "}
        <a className={link} href="mailto:hello@bartdunweg.com">
          hello@bartdunweg.com
        </a>
        .
      </p>

      <h2 className={h2}>What is collected</h2>

      <h3 className={h3}>Your account</h3>
      <p className={body}>
        An email address and a password. The password is never stored by {APP_NAME} in a readable
        form — authentication is handled by Supabase, and {APP_NAME} only ever sees a session token.
      </p>

      <h3 className={h3}>Your collection</h3>
      <p className={body}>
        Every card you add, and what you record about it: quantity, condition, grade, purchase
        price, purchase date, notes, whether it is a favourite, and whether you have excluded it
        from your collection&rsquo;s total value.
      </p>

      <h3 className={h3}>Your profile</h3>
      <p className={body}>
        A display name if you set one, a profile photo if you upload one, and whether you have
        switched your collection to public.
      </p>

      <h3 className={h3}>Analytics and crash reports</h3>
      <p className={body}>The two surfaces differ here, so both are stated plainly.</p>
      <ul className={list}>
        <li>
          <strong className={strong}>The website</strong> uses Vercel Web Analytics, which counts
          page views. It sets no cookies, does not follow you to other websites, and produces
          aggregate figures — which pages are read, roughly where in the world from, on what kind of
          device — rather than a profile of you. It is not connected to your account.
        </li>
        <li>
          <strong className={strong}>The iOS app</strong> has no analytics at all. If it crashes or
          hangs, a diagnostic report is sent to Sentry, an error-tracking service. Those reports
          carry technical information — the kind of crash, the device model, the operating system
          version, the app version — and deliberately not your email address, your access token, or
          anything you typed into the app&rsquo;s search.
        </li>
      </ul>

      <h3 className={h3}>Cookies</h3>
      <p className={body}>
        One cookie, and it is the one that signs you in: a session token issued by Supabase. Without
        it you would have to enter your password on every page. There are no advertising or tracking
        cookies here, so there is nothing to consent to and no banner asking you to. Your
        light-or-dark preference is kept in your browser&rsquo;s local storage and never sent to the
        server.
      </p>

      <h3 className={h3}>What is not collected</h3>
      <p className={body}>
        There is no advertising, no tracking across other apps or websites, and nothing is sold or
        shared for marketing. When you scan a card with the camera, the text is recognised on your
        device; no photograph is uploaded or stored.
      </p>

      <h2 className={h2}>Why, and on what legal basis</h2>
      <p className={body}>
        Only to run the service: to sign you in, to store and show your collection, to show a public
        collection page if you switch that on, and to fix crashes. There is no other purpose.
      </p>
      <p className={body}>
        Under the GDPR, your account and your collection are processed to perform a contract — you
        asked for an account, and this is what the account does. Crash reports and the
        website&rsquo;s aggregate page counts rest on a legitimate interest in the software working
        and in knowing which pages are read.
      </p>

      <h2 className={h2}>Who else sees it</h2>
      <ul className={list}>
        <li>
          <strong className={strong}>Supabase</strong> hosts the database and handles
          authentication. The database is hosted in the European Union, in Ireland, and your data is
          not transferred outside it.
        </li>
        <li>
          <strong className={strong}>Vercel</strong> hosts the website and provides the page-view
          analytics described above.
        </li>
        <li>
          <strong className={strong}>Sentry</strong> receives crash reports from the iOS app, and
          nothing from the website.
        </li>
        <li>
          <strong className={strong}>pokemontcg.io</strong> and{" "}
          <strong className={strong}>TCGdex</strong> supply card and set data, and{" "}
          <strong className={strong}>Cardmarket</strong> supplies prices. These are asked by{" "}
          {APP_NAME}&rsquo;s own servers, never by your browser or your phone, so they receive
          nothing identifying you — not your address, not your account, not what you searched for.
          Opening a &ldquo;Buy on Cardmarket&rdquo; link is an ordinary visit to their website and
          is governed by their policy, not this one.
        </li>
      </ul>
      <p className={body}>
        Nobody else. Your collection is private unless you switch on the public setting yourself,
        and even a public collection never shows prices, purchase details or your email address.
      </p>

      <h2 className={h2}>How long it is kept</h2>
      <p className={body}>
        Until you delete it. Deleting your account in Settings removes your profile and your entire
        collection immediately and permanently, in one operation — there is no grace period, no
        archived copy, and no way to undo it.
      </p>
      <p className={body}>
        Crash reports are kept by Sentry under its standard retention period for errors, 90 days,
        and then discarded.
      </p>

      <h2 className={h2}>Your rights</h2>
      <p className={body}>
        If you are in the EU or the UK you can ask for a copy of your data, ask for it to be
        corrected or deleted, object to it being processed, or complain to your national data
        protection authority — in the Netherlands, the Autoriteit Persoonsgegevens. Deleting your
        account in Settings does the erasure part instantly and without asking anyone; for anything
        else, write to{" "}
        <a className={link} href="mailto:hello@bartdunweg.com">
          hello@bartdunweg.com
        </a>
        .
      </p>

      <h2 className={h2}>Children</h2>
      <p className={body}>
        {APP_NAME} is not aimed at children under 16, and an account should not be created by one
        without a parent&rsquo;s involvement.
      </p>

      <h2 className={h2}>Changes to this policy</h2>
      <p className={body}>
        If this policy changes in a way that matters, you will be told before the change takes
        effect. The date at the top of this page always reflects the version you are reading.
      </p>

      <p className={`${body} mt-10`}>
        <Link className={link} href="/terms">
          Terms of use
        </Link>{" "}
        ·{" "}
        <Link className={link} href="/">
          Back to {APP_NAME}
        </Link>
      </p>
    </LegalPage>
  );
}

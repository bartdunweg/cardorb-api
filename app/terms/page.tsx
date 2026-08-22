import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { legal, legalList as list } from "@/components/shared/LegalPage";
import { APP_NAME } from "../../lib/core/config";
import { SITE_OG_IMAGE } from "../../lib/core/og";

/**
 * Terms of use — the document that protects the operator rather than the user.
 *
 * Written because Bart asked for it "gewoon voor überhaupt voor onszelf", not
 * because Apple demands it: Apple's standard EULA applies to an app that
 * supplies none, so this exists for the three things that standard EULA does
 * not cover and that this product specifically needs said out loud —
 *
 *   1. A price shown here is a market observation, not a valuation, and nobody
 *      should buy or sell on it. This app puts a number next to every card and
 *      totals a collection; that is exactly the shape of thing somebody treats
 *      as advice unless told otherwise.
 *   2. Card Orb is not affiliated with The Pokemon Company, Nintendo, Game
 *      Freak or Creatures. The product was renamed away from "Pokebinder" for
 *      this reason (see lib/core/config.ts) and the disclaimer is the other
 *      half of that decision.
 *   3. It is free, and a free service has to be able to change or stop.
 *
 * See docs/decisions/0043-terms-of-use.md. Not legal advice — it is honest
 * about what the software does and what is promised, which is the part that can
 * be verified from in here.
 */

const UPDATED = { iso: "2026-08-16", human: "16 August 2026" };

export const metadata: Metadata = {
  title: "Terms of use",
  description: `The terms you use ${APP_NAME} under: what it is, what is promised, and what is not.`,
  // The root layout noindexes the whole site by default; a legal page is one of
  // the few routes that has to opt back in. Same note as /privacy applies to
  // `images` below — declaring openGraph here replaces the parent's rather than
  // merging into it, so the site's OG image has to be named again.
  robots: { index: true, follow: true },
  alternates: { canonical: "/terms" },
  openGraph: {
    type: "article",
    url: "/terms",
    siteName: APP_NAME,
    title: `Terms of use · ${APP_NAME}`,
    locale: "en_GB",
    images: [SITE_OG_IMAGE],
  },
  twitter: { card: "summary_large_image", title: `Terms of use · ${APP_NAME}` },
};

const { h2, body, link, strong } = legal;

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated={UPDATED}>
      <p className={`${body} mt-6`}>
        These are the terms you use {APP_NAME} under — the website at cardorb.com and the {APP_NAME}{" "}
        app for iPhone and iPad. They are short on purpose. How your data is handled is a separate
        document: the{" "}
        <Link className={link} href="/privacy">
          privacy policy
        </Link>
        .
      </p>

      <h2 className={h2}>Who you are agreeing with</h2>
      <p className={body}>
        {APP_NAME} is operated by BADU Ventures B.V., Voorhaven 27C, 3025 HC Rotterdam, the
        Netherlands, registered with the Dutch Chamber of Commerce under KVK number 76480801. In
        these terms, &ldquo;we&rdquo; means that company and &ldquo;you&rdquo; means whoever is
        using {APP_NAME}. By creating an account or using the service, you accept these terms. If
        you do not, do not use it.
      </p>

      <h2 className={h2}>What {APP_NAME} is</h2>
      <p className={body}>
        A tool for keeping a record of a Pokémon card collection: what you own, what it is worth on
        the open market, and what is still missing from a set. It is free. There is no paid tier, no
        card limit, and nothing to cancel.
      </p>

      <h2 className={h2}>Prices are information, not advice</h2>
      <p className={body}>
        This is the part worth reading twice. The prices shown come from Cardmarket and describe
        what cards have been selling for. They are an observation of a market, not a valuation of
        your cards, not an offer, and not financial or investment advice. A collection total is
        arithmetic over those numbers, and it inherits every one of their limitations — a
        card&rsquo;s condition, its edition, and what someone will actually pay for it on a given
        day are not in it.
      </p>
      <p className={body}>
        <strong className={strong}>
          Do not buy, sell, insure or make any other financial decision on the strength of a number
          you read here.
        </strong>{" "}
        Get the card in front of someone who values cards for a living.
      </p>

      <h2 className={h2}>Your account</h2>
      <ul className={list}>
        <li>
          An account is for one person. Keep your password to yourself; anything done through your
          account is treated as done by you.
        </li>
        <li>You must be 16 or older, or have a parent or guardian involved if you are not.</li>
        <li>
          Tell us at{" "}
          <a className={link} href="mailto:hello@bartdunweg.com">
            hello@bartdunweg.com
          </a>{" "}
          if you think someone else is using your account.
        </li>
      </ul>

      <h2 className={h2}>Your collection is yours</h2>
      <p className={body}>
        Everything you put into {APP_NAME} — your cards, your notes, your purchase prices, your
        profile — stays yours. You give us permission to store it and show it back to you, and to
        show the parts you have chosen to make public, and nothing beyond that. We do not sell it,
        we do not use it to train anything, and we do not show it to anyone you have not shown it to
        yourself.
      </p>
      <p className={body}>
        Switching your collection to public is you choosing to publish it. Prices and purchase
        details are never included in a public collection, but the cards themselves become readable
        by anyone with the link, and by search engines.
      </p>

      <h2 className={h2}>What you may not do</h2>
      <ul className={list}>
        <li>Use somebody else&rsquo;s account, or try to reach data that is not yours.</li>
        <li>
          Attack, overload or probe the service, or work around the limits that keep it running for
          everyone else.
        </li>
        <li>
          Bulk-download the catalogue or other people&rsquo;s public collections by automated means.
          The documented public endpoints are there to be used at a reasonable rate; a scraper is
          not that.
        </li>
        <li>
          Put anything unlawful, abusive or infringing into a field other people can see — a display
          name, a username, a note on a public collection.
        </li>
      </ul>

      <h2 className={h2}>Pokémon is not ours, and we are not theirs</h2>
      <p className={body}>
        {APP_NAME} is an independent tool. It is not affiliated with, endorsed by, sponsored by or
        connected to The Pokémon Company, Nintendo, Game Freak or Creatures Inc. in any way.
        &ldquo;Pokémon&rdquo;, the card names, the set names and the card artwork are the property
        of their respective owners, and are shown here to identify the cards you own — the way a
        catalogue identifies what is in it.
      </p>
      <p className={body}>
        Card and set data comes from pokemontcg.io and TCGdex, and prices from Cardmarket. We depend
        on them, we do not control them, and we cannot promise that what they say is complete or
        correct.
      </p>

      <h2 className={h2}>It is free, and it comes as it is</h2>
      <p className={body}>
        {APP_NAME} is provided as it stands, without warranty of any kind. We do not promise it will
        be available, that it will be free of faults, that a card will match, that a price will be
        right, or that it will keep working the way it does today. Features can change or be
        removed.
      </p>
      <p className={body}>
        We may change or discontinue the service. If we ever shut it down, we will give you
        reasonable notice and a way to get your collection out first, unless something outside our
        control makes that impossible.
      </p>
      {/* Not "the CSV export is there for that" — it is not. Export is
          comingSoon: true on the landing page; only import is built. A terms
          page pointing at a feature that does not exist is the one kind of
          inaccuracy this document cannot afford. */}
      <p className={body}>
        Keep your own copy of anything you would mind losing. A CSV export is planned but not built
        yet, so for now your collection lives here and nowhere else.
      </p>

      <h2 className={h2}>Ending it</h2>
      <p className={body}>
        You can delete your account at any time in Settings. It takes your profile and your entire
        collection with it, immediately and permanently. We may suspend or close an account that
        breaks these terms, and will say why unless we are not allowed to.
      </p>

      <h2 className={h2}>Liability</h2>
      <p className={body}>
        To the fullest extent the law allows, we are not liable for indirect or consequential loss,
        for lost or corrupted data, or for any decision you make on the strength of information
        shown in {APP_NAME} — prices above all. Nothing here limits liability for intent or gross
        negligence, for death or personal injury, or any other liability that cannot be limited
        under Dutch law. If you are a consumer, your mandatory statutory rights are unaffected by
        anything in this document.
      </p>

      <h2 className={h2}>If you got the app from the App Store</h2>
      <p className={body}>
        These terms are between you and us. Apple is not a party to them and has no responsibility
        for {APP_NAME} — support, maintenance, faults and any claim about the app are ours, not
        theirs. Apple and its subsidiaries may enforce these terms against you as a third-party
        beneficiary. You also agree that you are not in a country subject to a U.S. embargo and are
        not on a U.S. prohibited-parties list, which is Apple&rsquo;s requirement rather than ours.
      </p>

      <h2 className={h2}>Changes to these terms</h2>
      <p className={body}>
        If these terms change in a way that matters, you will be told before the change takes
        effect. The date at the top of this page always reflects the version you are reading, and
        continuing to use {APP_NAME} after a change means accepting it.
      </p>

      <h2 className={h2}>Which law, and which court</h2>
      <p className={body}>
        Dutch law applies, and disputes go to the competent court in Rotterdam, the Netherlands. If
        you are a consumer resident elsewhere in the EU, this does not deprive you of the protection
        of your own country&rsquo;s mandatory rules or of your right to bring a claim there.
      </p>

      <h2 className={h2}>Contact</h2>
      <p className={body}>
        Anything at all:{" "}
        <a className={link} href="mailto:hello@bartdunweg.com">
          hello@bartdunweg.com
        </a>
        .
      </p>

      <p className={`${body} mt-10`}>
        <Link className={link} href="/privacy">
          Privacy policy
        </Link>{" "}
        ·{" "}
        <Link className={link} href="/">
          Back to {APP_NAME}
        </Link>
      </p>
    </LegalPage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/custom/Navbar";
import MarketingFooter from "@/components/custom/MarketingFooter";
import { legal, legalList as list } from "@/components/custom/LegalPage";
import Wordmark from "@/components/custom/Wordmark";
import { Button as UiButton } from "@/components/base/buttons/button";
import { colour, type ColourPair } from "../../lib/design/theme-values";
import { APP_NAME } from "../../lib/core/config";

/**
 * The brand page — what the mark is, which cut goes where, and where to get it.
 *
 * Half a source of truth, and it is worth being precise about which half. The
 * orb is *rendered*, by `Tools/GenerateAppIcon.swift` in the cardorb-ios
 * repository; that generator is the origin and it stays there, because a Swift
 * toolchain has no business living in a Next.js app. What lives here is
 * everything downstream of it: the files as served, the colours, and the rules
 * for using them.
 *
 * That split is not tidiness. The rules used to exist only as `brand/README.md`
 * in a repository nobody opens to build a web page — and that file is now
 * served verbatim at /brand/README.md, which makes the point rather than fixing
 * it: it is a generator's hand-off note, addressed to whoever copies the files,
 * not to somebody who wants to use the logo. This page is the one written for a
 * reader. It is also the reason the favicon here disagrees with what that README
 * recommends; see ADR-0049.
 *
 * It also makes the duplication go away in the right direction. cardorb-ios
 * commits its own copy of these files; after this it needs only the one the app
 * bundle genuinely cannot fetch — the app icon — and can point at these URLs
 * for the rest.
 *
 * Not LegalPage.tsx, though ADR-0042 rightly says to read it first: that shell
 * requires an `updated` date this page has no use for and caps its column at
 * --content-max, ~70 characters, which is correct for a document to be read and
 * wrong for a page whose subject is images side by side. Its *type scale* is
 * reused, which is the part that would otherwise drift.
 *
 * See docs/decisions/0048-the-orb-mark-on-the-web.md.
 */

export const metadata: Metadata = {
  title: "Brand",
  description: `The ${APP_NAME} mark: which version to use where, the colours, and the files.`,
  // No `robots: { index: true }`, and that omission is the decision rather than
  // an oversight — the root layout noindexes everything and exactly five routes
  // opt back in. This is a hand-off page for somebody who already has the link,
  // not something worth competing for in a search result. One line to reverse,
  // together with an entry in sitemap.ts, if that ever changes.
  alternates: { canonical: "/brand" },
};

const { h2, h3, body, link, strong } = legal;

/** The panel the marks are shown on: one light, one dark, side by side, so the
 *  chrome sphere can be judged against both without toggling the theme. */
const panel =
  "flex items-center justify-center gap-6 p-6 rounded-lg " +
  "border border-secondary min-h-[200px]";

/**
 * One cut of the mark, at a size worth looking at.
 *
 * Explicitly not <Wordmark>: that component is the mark at 24px next to the
 * name and hard-codes the shadowed cut, which is the right answer everywhere in
 * the product and the wrong one on the single page whose job is showing the
 * alternative. The real <Wordmark> is rendered further down, in the nav and the
 * footer, where anybody can see it in place.
 */
function Sample({ file, alt, size = 128 }: { file: string; alt: string; size?: number }) {
  return (
    <picture>
      <source srcSet={`/brand/${file}-256.avif`} type="image/avif" />
      <img src={`/brand/${file}-256.png`} width={size} height={size} alt={alt} className="block" />
    </picture>
  );
}

function Swatch({ name, pair }: { name: string; pair: ColourPair }) {
  return (
    <div className="flex flex-col gap-2">
      {/* rounded-pill, which despite the name is the rounded rectangle rather
          than the capsule — the shape every control on this site that sits
          beside a field wears. It read rounded-[var(--radius-control)] until the
          token guard was pointed at .tsx: no such token has ever existed, so
          this and the panel above were drawing square corners on the one page
          whose job is showing the shapes. */}
      <div className="flex h-14 rounded-pill overflow-hidden border border-secondary">
        {/* Both halves of the pair at once. A swatch that showed only the
            current theme's value would make this page tell half the truth
            depending on when you opened it. */}
        <div className="flex-1" style={{ background: pair.light }} />
        <div className="flex-1" style={{ background: pair.dark }} />
      </div>
      <div className="font-body text-xs text-primary">{name}</div>
      <div className="font-body text-xs text-tertiary">
        {pair.light} / {pair.dark}
      </div>
    </div>
  );
}

/**
 * Read from tokens.ts rather than typed out. A brand page with hand-copied hex
 * values is a page that is wrong within a month and confidently so — and the
 * whole argument for this page living in this repository is that the colours
 * are already here as code.
 */
const SWATCHES: [string, ColourPair][] = [
  ["Label", colour.label],
  ["Label secondary", colour.labelSecondary],
  ["Label tertiary", colour.labelTertiary],
  ["Background", colour.bgGrouped],
  ["Surface", colour.bgSurface],
];

/**
 * The two shapes, and the class that switches each one.
 *
 * Spelled out rather than assembled, because Tailwind reads source text: a
 * class name built at runtime is one it never sees, and the `@utility` block
 * would be defined and never emitted. Same reason `button.tsx` keeps its two
 * literals in `styles.shapes`.
 */
const SHAPES: [string, string, string][] = [
  ["Round", "shape-round", "the default; a capsule at every size"],
  ["Rectangle", "shape-rectangle", "the opt-in; 8px, and what buttons wore before"],
];

const SIZES = ["xs", "sm", "md", "lg", "xl"] as const;

const DOWNLOADS: [string, string][] = [
  ["The orb", "/brand/orb-512.png"],
  ["The orb, with its shadow", "/brand/orb-shadow-512.png"],
  ["The app icon, tiled", "/brand/orb-tile-512.png"],
  ["Social preview, 1200×630", "/brand/og-image.png"],
  ["Vector, the orb", "/brand/orb.svg"],
  ["Vector, the app icon", "/brand/orb-tile.svg"],
];

export default function BrandPage() {
  return (
    <div className="-mt-[var(--main-pad-top)]">
      <Navbar />

      {/* After the Navbar: the skip link's target on this page. See
          app/layout.tsx for why the landmark is per-screen rather than one
          in the root layout. */}
      <main
        id="main-content"
        className="w-[min(100%,1180px)] mx-auto [padding:0_var(--page-pad-x)_var(--page-pad-bottom)]"
      >
        {/* Wider than LegalPage's --content-max and centred like it. 900px is
            enough for two sample panels side by side, which is what this page
            is for; ~70 characters is not, and left-aligning it under a
            full-width footer just looks like something failed to load. */}
        <article className="max-w-[900px] mx-auto [padding-block:clamp(56px,8vw,96px)]">
          <h1
            className="mt-0 mb-4 text-primary font-body font-medium
              tracking-[-0.045em] leading-tight text-display-md"
          >
            Brand
          </h1>
          <p className={body}>
            {APP_NAME} is a sphere and two words. This page is what to use where, and where to get
            the files. Everything here is free to use for writing or talking about {APP_NAME};
            please do not use it to suggest that something else is {APP_NAME}.
          </p>

          <h2 className={h2}>The mark</h2>
          <p className={body}>
            The orb is the iOS app icon&rsquo;s sphere with the tile taken away, so the website and
            the installed app are recognisably the same thing. It carries no text and no fine
            detail, which means it survives being scaled — there is no size below which it stops
            being legible, unlike a word.
          </p>
          <p className={body}>
            Two cuts, and both are transparent. <strong className={strong}>The orb</strong> fills
            its box; use it where the layout already has depth of its own, or where a shadow would
            argue with what is around it.{" "}
            <strong className={strong}>The orb with its shadow</strong> sits on something; use it on
            a plain surface, where the sphere would otherwise float.
          </p>
          <div className="grid grid-cols-2 gap-4 my-6 [@media(max-width:640px)]:grid-cols-1">
            <div className={panel} style={{ background: colour.bgGrouped.light }}>
              <Sample file="orb" alt="The orb, without a shadow" />
              <Sample file="orb-shadow" alt="The orb, with its contact shadow" />
            </div>
            <div className={panel} style={{ background: colour.bgGrouped.dark }}>
              <Sample file="orb" alt="" />
              <Sample file="orb-shadow" alt="" />
            </div>
          </div>
          <p className={body}>
            The shadowed cut draws the sphere smaller inside the same box, because the shadow needs
            somewhere to fall — set both at the same width and its ball reads about 80% of the
            other&rsquo;s. Size it up if the two have to match.
          </p>

          <h3 className={h3}>Beside the name</h3>
          <p className={body}>
            The shadowed cut at 24px, with a gap and the name in the heading face. This is the
            lockup in the nav bar above and the footer below; it is one component, so it is the same
            everywhere.
          </p>
          {/* `bg-primary`, not a pinned light surface.
              Every other sample on this page pins a theme on purpose, and is
              right to: the orb pair above shows the same file on light and on
              dark deliberately, and the tile below is a PNG that does not care
              what the theme is. This one is different, because what it holds is
              not a file — <Wordmark /> draws the word with `text-primary`, which
              follows the theme. Pinning the background to light while the text
              followed the theme rendered the brand's own name in near-white on
              white, invisible, on the page whose whole job is showing how the
              mark is used. Both halves have to agree; the token makes them. */}
          <div className={`${panel} my-6 bg-primary`} style={{ minHeight: 0 }}>
            <Wordmark />
          </div>

          <h3 className={h3}>The tile</h3>
          <p className={body}>
            The orb on its off-white tile, which is the installed app icon. Use it where something
            else will round it off for you — a home screen, a launcher, an app store. That is not a
            style preference: iOS will not honour transparency in a home-screen icon and fills it
            with black, so a transparent cut used there arrives as a sphere in a black square.
          </p>
          <p className={body}>
            Not for a browser tab, though. Nothing masks a favicon — it is drawn as given, so the
            square arrives as a square and the off-white shows as a card the orb is glued to. The
            favicon here is the plain cut, which is already a circle.
          </p>
          <div
            className={`${panel} my-6`}
            style={{ background: colour.bgGrouped.light, minHeight: 0 }}
          >
            {/* No <picture> here and no AVIF: the tile is the one asset with a
                PNG-only life — it is what a favicon link and a manifest entry
                point at, and both are consumed by things that will not
                negotiate a format. Showing it as anything else would be showing
                a file this page does not ship.

                The rounding is the sample's, not the file's: the PNG is a
                square, and the squircle is applied by whatever installs it. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- this page's subject is the file as shipped, and next/image would show a recompressed derivative of it under a link that downloads the original. */}
            <img
              // The 192, not the 512 the download link below points at: this is
              // a 128px sample and the 512 is 100 KB of it.
              src="/brand/orb-tile-192.png"
              width={128}
              height={128}
              alt="The app icon: the orb on its tile"
              className="block rounded-[22%]"
            />
          </div>

          <h2 className={h2}>Colour</h2>
          <p className={body}>
            Every colour is a pair — a light value and a dark one, neither of them the default. Left
            half light, right half dark. These are read straight out of the design tokens, so this
            page cannot drift from the product.
          </p>
          <div className="grid grid-cols-3 gap-5 my-6 [@media(max-width:640px)]:grid-cols-2">
            {SWATCHES.map(([name, pair]) => (
              <Swatch key={name} name={name} pair={pair} />
            ))}
          </div>

          <h2 className={h2}>Shape</h2>
          <p className={body}>
            Controls come in two shapes. Round is the default and what a button wears unless
            something says otherwise; rectangle is the opt-in, and it is exactly what every button
            wore before the two existed. Both rows below are the same component at the same five
            sizes — the only difference is one class on the box around each row.
          </p>
          <div className="flex flex-col gap-6 my-6">
            {SHAPES.map(([name, shapeClass, note]) => (
              <div key={name}>
                <div className="font-body text-xs text-tertiary mb-2">
                  {name} — {note}
                </div>
                {/* The class goes on the container, not on the buttons. That is
                    the mechanism, so it is what this page should show: the
                    buttons inside carry no shape prop and have never heard of
                    shape. */}
                <div className={`${shapeClass} flex flex-wrap items-center gap-3`}>
                  {SIZES.map((size) => (
                    <UiButton key={size} color="secondary" size={size}>
                      {size}
                    </UiButton>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className={body}>
            Side padding changes with the shape as well as the corner: a capsule curves away from
            its text for the control&rsquo;s full height, so a word set at the rectangle&rsquo;s
            padding reads as touching the edge. Inputs, input groups and segmented controls read the
            same two variables, so a form wrapped in one class comes out whole.
          </p>

          <h2 className={h2}>Using it</h2>
          <ul className={list}>
            <li>
              <strong className={strong}>Prefer AVIF.</strong> The orb is one smooth gradient, which
              is the thing PNG stores worst: 6 KB against 49 KB at 256px, for a picture no eye can
              tell apart. Serve the AVIF with the PNG as a <code>&lt;picture&gt;</code> fallback.
            </li>
            <li>
              <strong className={strong}>Raster over vector.</strong> The SVGs are an approximation
              — a shaded chrome material has no exact SVG expression, and they carry less silver in
              the lit mass and only a hint of the iridescent rim. They hold up to about 64px and are
              there for the places that demand a vector: print, a slide, a press kit.
            </li>
            <li>
              <strong className={strong}>
                Give it <code>alt=&quot;&quot;</code> next to the name.
              </strong>{" "}
              Beside the words &ldquo;{APP_NAME}&rdquo; the orb is decorative, and a screen reader
              announcing the name twice is worse than announcing it once. A real <code>alt</code>{" "}
              only when it stands alone.
            </li>
            <li>
              <strong className={strong}>Set width and height.</strong> Otherwise the page jumps
              while it loads.
            </li>
            <li>
              <strong className={strong}>Do not recolour, rotate or outline it.</strong> Its whole
              subject is the way light falls on it.
            </li>
          </ul>

          <h2 className={h2}>Files</h2>
          <p className={body}>
            Served from this site, so they can be linked to rather than copied. These URLs are meant
            to keep working.
          </p>
          <ul className={list}>
            {DOWNLOADS.map(([label, href]) => (
              <li key={href}>
                <a className={link} href={href} download>
                  {label}
                </a>{" "}
                <span className="text-tertiary">{href.split("/").pop()}</span>
              </li>
            ))}
          </ul>
          <p className={body}>
            Other sizes exist under <code>/brand/</code> — the orb and its shadowed cut run 64, 128,
            256 and 512 as PNG and AVIF, and 1024 as AVIF only. The largest cuts are AVIF on
            purpose: at that size the PNG would be roughly two megabytes of smooth gradient, and
            anything that can display the orb that large can decode AVIF.
          </p>

          <h2 className={h2}>Where it comes from</h2>
          <p className={body}>
            The orb is rendered rather than drawn, by a generator that lives with the iOS app.
            Retuning the app icon and re-running it keeps the app and the site in step; these files
            are its output, handed over. That is why the mark cannot be edited here — edit the
            generator and re-export.
          </p>

          <p className={body}>
            Anything this page does not answer:{" "}
            <Link className={link} href="/privacy">
              privacy
            </Link>{" "}
            and{" "}
            <Link className={link} href="/terms">
              terms
            </Link>{" "}
            cover the rest. {APP_NAME} is not affiliated with The Pok&eacute;mon Company, Nintendo,
            Game Freak or Creatures.
          </p>
        </article>

        <MarketingFooter />
      </main>
    </div>
  );
}

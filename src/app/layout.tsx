import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { colour } from "@/lib/design/theme-values.generated";
import { Analytics } from "@vercel/analytics/next";
import { Inter } from "next/font/google";
import { Providers } from "@/providers";
import { APP_NAME, APP_TAGLINE, SITE_URL } from "@/lib/core/config";

/**
 * The one family tokens.css asks for: both --font-main and --font-body resolve
 * to Inter now. Loaded here because a variable with nothing behind it falls
 * through to the system stack, and the collection then renders in a font that
 * is close enough to look like a mistake rather than a choice.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  // Exactly --color-bg-grouped, in both themes. Safari paints the bars above and
  // below the page with this, so while it said #ffffff and #101010 the chrome
  // was a shade off the page it framed and the seam was visible at the top and
  // the bottom of every screen. Written out rather than read from the token,
  // because this is a meta tag rather than CSS; if the token moves, this moves.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: colour.bgGrouped.light },
    { media: "(prefers-color-scheme: dark)", color: colour.bgGrouped.dark },
  ],
};

export const metadata: Metadata = {
  /**
   * What every relative URL in any metadata on any route is resolved against.
   *
   * Without it Next warns and drops relative og:image and canonical values, so
   * this is what makes the public page's own metadata mean anything. It lives
   * on the layout because it is one fact about the deployment rather than
   * something a route decides.
   */
  metadataBase: new URL(SITE_URL),
  /**
   * The name, and how every other page's title ends.
   *
   * A template rather than a bare string, so a title bar and a search result
   * both say which product they belong to without every route repeating the
   * word: /login is "Sign in · Card Orb", a public collection is "Bart’s
   * Pokémon card collection · Card Orb" for Bart and somebody else's name for
   * somebody else (see lib/core/account/owner.ts). The two pages that are mostly the
   * name itself opt out with `title.absolute`, which is what that field is for.
   *
   * `default` is required alongside a template and is what a child with no
   * title of its own gets.
   */
  title: {
    default: `${APP_NAME} — your Pokémon card collection, sorted`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  // No `authors`. It named one person for the whole site, which was true while
  // there was one person here and became a claim over everybody else's pages
  // the moment there were accounts. Site-wide metadata is about the product;
  // whose a collection is belongs on that collection's own route.
  /**
   * noindex is the default here, and it is still the right default: almost
   * every route in this app is a tool behind a password, and a tool has nothing
   * to offer a search engine.
   *
   * Five routes override it, and only five — /, which is the page whose whole
   * job is being found; /user/<name>, which is the collection worth finding;
   * /app/ios, which is the iPhone app's page; and /privacy and /terms, which
   * are linked from App Store Connect and have to be reachable. Set here rather
   * than per-route so that a new screen is private by accident rather than
   * public by accident, which is the direction that mistake should fall in.
   *
   * The count has been wrong in this comment twice, because it grew by one
   * twice. `grep -rn "index: true" app/` is the list, and it is authoritative.
   */
  robots: { index: false, follow: false },
};

/**
 * `modal` is the parallel route the intercepted card dialog renders into. It
 * has to be named as a prop: without it the slot is never rendered and clicking
 * a card navigates to the full page instead, which loses the list's query,
 * filters and scroll position.
 */
export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // scrollbar-gutter:stable — Safari paints the rubber-band overscroll
      // area from html's own background, and html+body have to agree on it
      // or the top/bottom bands show a seam. See body's classes below.
      className={`${inter.variable} bg-secondary text-base antialiased [scrollbar-gutter:stable]`}
    >
      <head>
        {/* Only the choice. The machine is the stylesheet's job now.
            This used to read the OS preference too and write an attribute
            either way, because tokens.css kept its dark values behind
            [data-theme="dark"] and somebody had to set it or every visitor got
            the light palette. The tokens are light-dark() pairs under
            color-scheme: light dark now, so an absent attribute already means
            "ask the machine" — answered in CSS, before this runs, and for
            somebody with JavaScript off, who used to get light whatever their
            machine said.
            What is left is the one thing CSS cannot know: that this person
            chose. Blocking and in <head> on purpose — done after paint, a dark
            reader gets a white flash first. Mirrored by ThemeProvider, which
            observes the attribute rather than owning it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("theme");if(s==="dark"||s==="light")document.documentElement.setAttribute("data-theme",s);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-secondary text-primary font-body min-h-screen text-pretty">
        <Providers>
          <a
            href="#main-content"
            className="absolute -top-full left-4 px-4 py-2
              bg-label text-bg-surface rounded-orb-sm text-xs
              [z-index:var(--z-skip)] no-underline focus:top-4"
          >
            Skip to content
          </a>
          {/* A <div>, not the <main>, and not `id="main-content"` — both moved
              down to the individual screens.

              This used to be `<main id="main-content">`, which put the skip
              link's target above every screen's own navigation: AppShell
              renders the rail and the tab bar inside {children}, so "Skip to
              content" landed a keyboard user in front of the whole rail and
              skipped nothing but the warning bar above. A landmark can only be
              in the right place if the thing that knows where the navigation
              ends puts it there, and that is each shell, not this file.

              Every screen therefore renders exactly one <main id="main-content">
              after its own nav; app/main-landmark.test.ts is what keeps a new
              route from forgetting. This wrapper keeps the padding it always
              had, so the six shells that cancel it with -mt-[var(--main-pad-top)]
              are cancelling the same box as before.

              ml-0 + pt-[var(--main-pad-top)] used to live in tabbar.css's own
              #main-content rule: the bar pads this to clear itself, on
              desktop where it's centred at the top (see tokens.css's
              responsive step for --main-pad-top). The 640px override
              (originally card-shell.css) cancels that below 640px, where the
              nav moves to the bottom — otherwise a grey strip of page colour
              shows above the content. Exact 640px arbitrary media query
              rather than Tailwind's max-sm (which is <640px, not <=640px)
              to match the boundary tabbar.css/tokens.css's 641px split used. */}
          <div className="ml-0 pt-[var(--main-pad-top)] [@media(max-width:640px)]:pt-0">
            {children}
          </div>
          {modal}
        </Providers>
        {/* In production this serves itself from /_vercel/insights on this
            origin, so the CSP's script-src 'self' and connect-src 'self'
            already cover it. Locally it reaches for va.vercel-scripts.com
            instead, which is why next.config.ts names that host in dev only. */}
        <Analytics />
      </body>
    </html>
  );
}

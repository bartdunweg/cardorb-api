import type { Metadata, Viewport } from "next";
import { colour } from "../lib/design/tokens";
import { Analytics } from "@vercel/analytics/next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "./components/ThemeProvider";
import { APP_NAME, APP_TAGLINE, OWNER_NAME, SITE_URL } from "../lib/core/config";
import "./globals.css";

/**
 * The two families tokens.css asks for: --font-main is Satoshi and --font-body
 * is Inter. Both are loaded here because a variable with nothing behind it
 * falls through to the system stack, and the collection then renders in a font
 * that is close enough to look like a mistake rather than a choice.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

const satoshi = localFont({
  src: [
    { path: "./fonts/satoshi-regular.woff2", weight: "400" },
    { path: "./fonts/satoshi-medium.woff2", weight: "500" },
    { path: "./fonts/satoshi-bold.woff2", weight: "700" },
  ],
  display: "swap",
  variable: "--font-satoshi",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  // Exactly --color-left-bg, in both themes. Safari paints the bars above and
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
   * word: /login is "Sign in · Card Orb", the public collection is "Bart's
   * Pokémon card collection · Card Orb". The two pages that are mostly the
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
  authors: [{ name: OWNER_NAME }],
  /**
   * noindex is the default here, and it is still the right default: almost
   * every route in this app is a tool behind a password, and a tool has nothing
   * to offer a search engine.
   *
   * Two routes override it, and only two — / , which is the page whose whole
   * job is being found, and /user/<name>, which is the collection worth
   * finding. Set here rather than per-route so that a new screen is private by
   * accident rather than public by accident, which is the direction that
   * mistake should fall in.
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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${satoshi.variable}`}>
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
      <body>
        <ThemeProvider>
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <main id="main-content">{children}</main>
          {modal}
        </ThemeProvider>
        {/* In production this serves itself from /_vercel/insights on this
            origin, so the CSP's script-src 'self' and connect-src 'self'
            already cover it. Locally it reaches for va.vercel-scripts.com
            instead, which is why next.config.ts names that host in dev only. */}
        <Analytics />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "./components/ThemeProvider";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#101010" },
  ],
};

export const metadata: Metadata = {
  title: "binder",
  description: "A Pokemon card collection, and the API behind it.",
  // Nothing here is for search engines: it is one person's collection tool.
  // This is also why every JSON-LD graph the portfolio's /cards carried was
  // dropped on the way over rather than ported.
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
        {/* tokens.css puts its dark values behind [data-theme="dark"], so
            something has to set that attribute or every visitor gets the light
            palette. Blocking and in <head> on purpose: done after paint, the
            page flashes white first. Reads the saved choice before the OS
            preference, because CardsProfile offers a toggle and a stored
            preference that loses to the system on every reload is not a
            preference. Mirrored by ThemeProvider, which observes the attribute
            rather than owning it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("theme");var d=s==="dark"||s==="light"?s:window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",d);}catch(e){}})();`,
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
      </body>
    </html>
  );
}

"use client";
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useSyncExternalStore,
  ReactNode,
} from "react";

const ThemeContext = createContext<{ theme: string; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

// localStorage throws in Safari with "Block all cookies" and in sandboxed
// iframes. The theme should still switch (for the session) when persistence is
// unavailable, so every access goes through these guards, mirroring the
// try/catch in the pre-paint script in layout.tsx.
function readSavedTheme(): string | null {
  try {
    return localStorage.getItem("theme");
  } catch {
    return null;
  }
}
function saveTheme(next: string) {
  try {
    localStorage.setItem("theme", next);
  } catch {}
}

// The data-theme attribute (set before paint by the blocking script in
// layout.tsx) is the single source of truth; React only mirrors it. Reading it
// through useSyncExternalStore keeps hydration safe: the server snapshot
// ("light") matches the server HTML, and React swaps in the real value right
// after hydration instead of reporting an unfixable attribute mismatch.
function subscribeToThemeAttr(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}
const readThemeAttr = () => document.documentElement.getAttribute("data-theme") ?? "light";
const serverTheme = () => "light";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeToThemeAttr, readThemeAttr, serverTheme);

  const apply = useCallback((next: string) => {
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  // The theme-color meta in layout.tsx is keyed on the OS preference, which is
  // the one thing the site's own switch does not change: pick dark on a machine
  // set to light and the browser goes on painting its chrome white around a
  // dark page. Rewritten here so the two always agree.
  //
  // Read off the document rather than stated, because the colour it has to
  // match is a token and the pair had already drifted: this said --color-bg,
  // the card colour, while body is painted --color-left-bg. On iOS Safari that
  // is the tint of the bars above and below the page, so both sat a step off
  // the page itself. Whatever tokens.css says body is, the chrome is.
  //
  // The media attribute is removed rather than emptied. Both tags ship with one
  // ("(prefers-color-scheme: light)" and its dark twin) and only the one that
  // matches the OS counts, which is the whole reason this effect exists; an
  // empty attribute is a media query list of nothing, which by the spec matches
  // every environment and by that reading is the same as no attribute at all.
  // On iOS Safari the two are not the same in practice: the bar at the foot of
  // the page kept the tint it was given on load while the one at the top
  // followed the switch, which is what a tag being skipped rather than read
  // looks like. Nothing is lost by taking it off: at this point the tag is no
  // longer about the OS preference, so it has no condition left to carry.
  //
  // What this cannot fix is when Safari looks. The colour is written in the same
  // interaction that flips the theme, and iOS has long been late to re-tint the
  // bottom bar until something else makes it repaint. If it still lags after
  // this, it lags on a tag that says the right thing.
  useEffect(() => {
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-left-bg")
      .trim();
    if (!bg) return;
    for (const el of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      el.removeAttribute("media");
      el.content = bg;
    }
  }, [theme]);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    // Follow OS theme changes only while the visitor hasn't picked a theme.
    const onChange = (e: MediaQueryListEvent) => {
      if (!readSavedTheme()) apply(e.matches ? "dark" : "light");
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [apply]);

  const toggle = useCallback(() => {
    const next = readThemeAttr() === "dark" ? "light" : "dark";
    saveTheme(next);
    apply(next);
  }, [apply]);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

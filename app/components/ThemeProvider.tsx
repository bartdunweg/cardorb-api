"use client";
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useSyncExternalStore,
  ReactNode,
} from "react";

/**
 * What somebody chose, which is not the same as what they see.
 *
 * "system" is the absence of a choice, and it is stored as the absence of the
 * key rather than as the word — two representations of one state is how they
 * drift.
 */
export type Mode = "system" | "light" | "dark";

const ThemeContext = createContext<{
  /** What is on screen: "light" or "dark", never "system". */
  theme: string;
  /** What was chosen. "system" means the machine decides. */
  mode: Mode;
  setMode: (next: Mode) => void;
  toggle: () => void;
}>({
  theme: "light",
  mode: "system",
  setMode: () => {},
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

// The data-theme attribute (set before paint by the blocking script in
// layout.tsx) is the single source of truth; React only mirrors it. Reading it
// through useSyncExternalStore keeps hydration safe: the server snapshot
// ("light") matches the server HTML, and React swaps in the real value right
// after hydration instead of reporting an unfixable attribute mismatch.
/**
 * Two things can change what is on screen, so both are subscribed to.
 *
 * The attribute, when somebody picks. And the machine, when nobody has —
 * because an absent attribute no longer means light, it means "the stylesheet
 * is answering the OS through color-scheme". Without the second subscription
 * React would go on believing it was light while the page had gone dark
 * underneath it, which matters for anything drawn from `theme` rather than
 * from CSS.
 */
function subscribeToThemeAttr(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    mql.removeEventListener("change", onChange);
  };
}

/**
 * What is actually on screen.
 *
 * The attribute if there is one, and otherwise the machine's answer — which is
 * what the stylesheet is already doing. This is React catching up to CSS
 * rather than deciding anything.
 */
const readThemeAttr = () =>
  document.documentElement.getAttribute("data-theme") ??
  (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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
    // The used value, not the token. It used to read --color-left-bg by name,
    // which was right until two things: the token is being renamed, and under
    // light-dark() an unregistered custom property hands back the literal token
    // stream — "light-dark(#fafafa, #181818)" — which is not a colour a meta
    // tag can carry.
    //
    // Asking the body what it is painted is the same intent the old comment
    // stated ("whatever tokens.css says body is, the chrome is") enforced by
    // the browser rather than by a name matching. It survives the rename, it
    // survives light-dark(), and it survives whatever paints body next.
    const bg = getComputedStyle(document.body).backgroundColor;
    if (!bg) return;
    for (const el of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      el.removeAttribute("media");
      el.content = bg;
    }
  }, [theme]);

  // The listener that used to live here is gone, and its absence is the point.
  // It followed OS changes while nothing was stored, which is exactly what
  // `color-scheme: light dark` plus light-dark() now do in CSS — before any
  // JavaScript runs, and for somebody with JavaScript off. A whole class of
  // "React and the stylesheet disagree about which theme it is" went with it.

  /**
   * Three answers, and the third is the one that was unreachable.
   *
   * The stored vocabulary was "dark" | "light", so the moment anybody pressed
   * the toggle once, "follow my machine" stopped being an option they could
   * get back to — a door that only goes one way. Absent still means system, so
   * every browser holding a "light" or a "dark" from before carries on
   * unchanged and there is nothing to migrate.
   *
   * Clearing the key is what selects system: there is no "system" written to
   * storage, because the absence *is* the state, and storing a word for it
   * would mean two representations of one answer.
   */
  const setMode = useCallback(
    (next: Mode) => {
      try {
        if (next === "system") localStorage.removeItem("theme");
        else localStorage.setItem("theme", next);
      } catch {}
      // Removing the attribute is the whole of "follow my machine": the
      // stylesheet answers the OS on its own from there, and the observer above
      // tells React what it decided.
      if (next === "system") document.documentElement.removeAttribute("data-theme");
      else apply(next);
    },
    [apply],
  );

  /** The shell's two-state switch, kept for the control that still uses it. */
  const toggle = useCallback(() => {
    setMode(readThemeAttr() === "dark" ? "light" : "dark");
  }, [setMode]);

  const saved = readSavedTheme();
  const mode: Mode = saved === "light" || saved === "dark" ? saved : "system";

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

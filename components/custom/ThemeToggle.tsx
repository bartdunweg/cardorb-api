"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/custom/ThemeProvider";

/**
 * The landing nav's own switch: an icon button inline with "Sign in", not a
 * circle floating loose over the page. The app has its own switch already —
 * AppearanceSettings.tsx in Settings, and the inline one CardsProfile.tsx
 * draws on /cards — this is only for the one screen that has neither.
 */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="grid place-items-center w-8 h-8 rounded-full text-secondary
        transition-colors duration-150 ease-out hover:text-primary"
    >
      {isDark ? (
        <Sun size={17} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon size={17} strokeWidth={1.75} aria-hidden="true" />
      )}
    </button>
  );
}

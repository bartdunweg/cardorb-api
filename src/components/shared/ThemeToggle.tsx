"use client";

import { Moon01, Sun } from "@untitledui-pro/icons/line";
import { Button as UntitledButton } from "@/components/base/buttons/button";
import { useTheme } from "@/components/shared/ThemeProvider";

/**
 * The landing nav's own switch: an icon button inline with "Sign in", not a
 * circle floating loose over the page. The app has its own switch already —
 * AppearanceSettings.tsx in Settings, and the inline one CardsProfile.tsx
 * draws on /cards — this is only for the one screen that has neither.
 */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  // Icon-only and borderless: `tertiary` is the one colour in their vocabulary
  // that draws no fill and no ring until it is pointed at, which is what this
  // slot in the nav needs — it sits beside a text link, not beside a button.
  return (
    <UntitledButton
      color="tertiary"
      size="sm"
      iconLeading={isDark ? Sun : Moon01}
      onPress={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    />
  );
}

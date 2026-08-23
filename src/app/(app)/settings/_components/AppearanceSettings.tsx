"use client";

import { useTheme, type Mode } from "@/components/shared/ThemeProvider";
import Segmented from "@/components/shared/Segmented";
import { SettingsHint } from "@/features/account/components/SettingsPanel";

/**
 * Three answers, and the third was unreachable until now.
 *
 * The stored vocabulary was "light" | "dark", so the system preference was
 * followed only until somebody pressed the toggle once — after which there was
 * no way back to it. "System" is the absence of a stored choice rather than a
 * word written down, because two representations of one state is how they drift.
 *
 * A segmented control — Untitled UI's ButtonGroup, via the shared `Segmented`
 * the era and sort switches already use — rather than a grid of radio cards:
 * this is one answer out of three, so it reads as one more of the app's toggles.
 * The line below says which device state "System" currently resolves to, which
 * is the one thing the segments cannot show on their own.
 */
const OPTIONS: readonly (readonly [Mode, string])[] = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
];

export default function AppearanceSettings() {
  const { mode, theme, setMode } = useTheme();

  return (
    <>
      <Segmented<Mode> label="Appearance" value={mode} onChange={setMode} options={OPTIONS} />
      <SettingsHint>
        {mode === "system"
          ? `Following this device, which is currently ${theme}.`
          : `Set to ${mode}, whatever this device prefers.`}
      </SettingsHint>
    </>
  );
}

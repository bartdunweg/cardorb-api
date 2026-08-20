"use client";

import { useTheme, type Mode } from "./ThemeProvider";
import { SettingsHint, SettingsPanel } from "./SettingsPanel";

/**
 * Three answers, and the third was unreachable until now.
 *
 * The stored vocabulary was "light" | "dark", so the system preference was
 * followed only until somebody pressed the toggle once — after which there was
 * no way back to it. A door that opens one way. "System" is the absence of a
 * stored choice rather than a word written down, because two representations of
 * one state is how they drift.
 *
 * A radiogroup rather than three buttons: these are one choice with three
 * options, and a radio group is what arrow keys already know how to move
 * through. Three buttons would be three tab stops and no relationship between
 * them.
 */
const OPTIONS: { value: Mode; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Follow this device" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

export default function AppearanceSettings() {
  const { mode, theme, setMode } = useTheme();

  return (
    <SettingsPanel>
      {/* No panel title: this is the only panel in the Appearance group, and
          the group's own heading already says the word once. */}
      <div
        className="grid grid-cols-3 gap-2 max-w-[26rem]"
        role="radiogroup"
        aria-label="Appearance"
      >
        {OPTIONS.map((o) => (
          <label key={o.value} className="group">
            <input
              type="radio"
              name="appearance"
              value={o.value}
              checked={mode === o.value}
              onChange={() => setMode(o.value)}
              className="absolute opacity-0 w-0 h-0"
            />
            <span
              className="block p-3 rounded-btn border border-[var(--color-border-active)] text-center cursor-pointer
                group-has-[:checked]:border-[var(--color-tint)] group-has-[:checked]:[box-shadow:inset_0_0_0_1px_var(--color-tint)]
                group-has-[:focus-visible]:[outline:2px_solid_var(--color-tint)] group-has-[:focus-visible]:[outline-offset:2px]"
            >
              <span className="block text-primary font-medium">{o.label}</span>
              <SettingsHint>{o.hint}</SettingsHint>
            </span>
          </label>
        ))}
      </div>

      <SettingsHint>
        {mode === "system"
          ? `Following this device, which is currently ${theme}.`
          : `Set to ${mode}, whatever this device prefers.`}
      </SettingsHint>
    </SettingsPanel>
  );
}

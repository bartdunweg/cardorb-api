"use client";

import { useTheme, type Mode } from "./ThemeProvider";

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
    <section className="settings-panel">
      <h2 className="settings-panel-title">Appearance</h2>

      <div className="settings-modes" role="radiogroup" aria-label="Appearance">
        {OPTIONS.map((o) => (
          <label key={o.value} className="settings-mode">
            <input
              type="radio"
              name="appearance"
              value={o.value}
              checked={mode === o.value}
              onChange={() => setMode(o.value)}
            />
            <span className="settings-mode-face">
              <span className="settings-mode-label">{o.label}</span>
              <span className="settings-hint">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <p className="settings-hint">
        {mode === "system"
          ? `Following this device, which is currently ${theme}.`
          : `Set to ${mode}, whatever this device prefers.`}
      </p>
    </section>
  );
}

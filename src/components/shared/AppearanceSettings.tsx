"use client";

import { useTheme, type Mode } from "@/components/shared/ThemeProvider";
import { Radio as AriaRadio } from "react-aria-components";
import { RadioGroup } from "@/components/base/radio-buttons/radio-buttons";
import { SettingsHint, SettingsPanel } from "@/components/shared/SettingsPanel";

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
      {/* Their <RadioGroup>, drawn as three cards rather than three dots.
          RadioButton is a dot with a label beside it; this is a picker where the
          option *is* the card, which is a layout Untitled UI has no component
          for — so the group and its state come from them and the card is ours.
          React Aria gives the arrow-key behaviour a radiogroup should have and
          the hand-rolled version never had. */}
      <RadioGroup
        value={mode}
        onChange={(v) => setMode(v as (typeof OPTIONS)[number]["value"])}
        aria-label="Appearance"
        className="grid grid-cols-3 gap-2 max-w-[26rem]"
      >
        {OPTIONS.map((o) => (
          <AriaRadio key={o.value} value={o.value} className="group cursor-pointer">
            <span
              className="block p-3 rounded-btn border border-primary text-center
                group-data-[selected]:border-brand group-data-[selected]:ring-1 group-data-[selected]:ring-brand group-data-[selected]:ring-inset
                group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-brand"
            >
              <span className="block text-primary font-medium">{o.label}</span>
              <SettingsHint>{o.hint}</SettingsHint>
            </span>
          </AriaRadio>
        ))}
      </RadioGroup>

      <SettingsHint>
        {mode === "system"
          ? `Following this device, which is currently ${theme}.`
          : `Set to ${mode}, whatever this device prefers.`}
      </SettingsHint>
    </SettingsPanel>
  );
}

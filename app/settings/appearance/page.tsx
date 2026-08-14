import type { Metadata } from "next";
import AppearanceSettings from "../../components/AppearanceSettings";
import { SettingsPanels } from "../../components/SettingsPanel";

export const metadata: Metadata = { title: "Appearance" };

export default function AppearancePage() {
  return (
    <SettingsPanels>
      <AppearanceSettings />
    </SettingsPanels>
  );
}

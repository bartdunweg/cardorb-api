import type { Metadata } from "next";
import AppearanceSettings from "../../components/AppearanceSettings";

export const metadata: Metadata = { title: "Appearance" };

export default function AppearancePage() {
  return (
    <div className="settings-panels">
      <AppearanceSettings />
    </div>
  );
}

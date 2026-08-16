"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SettingsHint,
  SettingsInput,
  SettingsPanel,
  SettingsPanelTitle,
  SettingsPanels,
  SettingsSaid,
} from "./SettingsPanel";

/**
 * The account: the address, the password, and the way out of this device.
 *
 * Everything here already had a working endpoint and no button. Signing out,
 * changing a password, deleting an account: all built during the accounts work,
 * none of it reachable from a screen. /settings/password in particular has
 * existed the whole time with nothing linking to it — it is where a recovery
 * link lands, so it could only be reached by losing your password first.
 *
 * Deleting the account left this file when Settings became one page: it is the
 * last section on that page now, in DeleteAccountSettings.tsx.
 */
export default function AccountSettings({ email }: { email: string }) {
  const router = useRouter();

  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Record<string, string | null>>({});

  const say = (k: string, v: string | null) => setSaid((s) => ({ ...s, [k]: v }));

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    const wanted = newEmail.trim();
    if (!wanted.includes("@")) return say("email", "That does not look like an email address.");
    setBusy("email");
    say("email", null);
    try {
      const res = await fetch("/api/v1/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: wanted }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      say(
        "email",
        res.ok
          ? // Both addresses, and the form has to say so: Supabase asks the old
            // one to approve the change as well, so somebody who only checks
            // the new inbox waits forever for a change that is half-confirmed.
            "Check both inboxes — the old address has to approve the change too."
          : (data.error ?? "That address could not be set."),
      );
      if (res.ok) setNewEmail("");
    } catch {
      say("email", "No answer from the server.");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy("signout");
    await fetch("/api/v1/session", { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <SettingsPanels>
      <SettingsPanel>
        <SettingsPanelTitle>Email address</SettingsPanelTitle>
        <SettingsHint>Currently {email}.</SettingsHint>
        <form onSubmit={changeEmail}>
          <SettingsInput
            type="email"
            autoComplete="email"
            placeholder="new@example.com"
            // A placeholder disappears as you type and is not a name.
            aria-label="New email address"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button className="btn" type="submit" disabled={busy === "email" || !newEmail.trim()}>
            {busy === "email" ? "Sending…" : "Change address"}
          </button>
          {said.email && <SettingsSaid>{said.email}</SettingsSaid>}
        </form>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelTitle>Password</SettingsPanelTitle>
        <SettingsHint>
          Setting a new one takes effect immediately and does not sign out your
          other devices.
        </SettingsHint>
        <Link className="btn" href="/settings/password">
          Change password
        </Link>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelTitle>Sign out</SettingsPanelTitle>
        <SettingsHint>On this device only.</SettingsHint>
        <button className="btn" type="button" onClick={signOut} disabled={busy === "signout"}>
          {busy === "signout" ? "Signing out…" : "Sign out"}
        </button>
      </SettingsPanel>

      {/* Deleting used to be the fourth panel here. It is its own section at
          the bottom of the page now — see DeleteAccountSettings.tsx. */}
    </SettingsPanels>
  );
}

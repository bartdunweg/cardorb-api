"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/shared/Button";
import {
  SettingsHint,
  SettingsInput,
  SettingsPanelTitle,
  SettingsSaid,
} from "@/features/account/components/SettingsPanel";

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
    <>
      <form onSubmit={changeEmail}>
        <SettingsInput
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="new@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          hint={`Currently ${email}.`}
        />
        <Button type="submit" className="mt-4" disabled={busy === "email" || !newEmail.trim()}>
          {busy === "email" ? "Sending…" : "Change address"}
        </Button>
        <SettingsSaid>{said.email ?? ""}</SettingsSaid>
      </form>

      <div>
        <SettingsPanelTitle>Password</SettingsPanelTitle>
        <SettingsHint>
          Setting a new one takes effect immediately and does not sign out your other devices.
        </SettingsHint>
        <Button href="/settings/password" className="mt-1">
          Change password
        </Button>
      </div>

      <div>
        <SettingsPanelTitle>Sign out</SettingsPanelTitle>
        <SettingsHint>On this device only.</SettingsHint>
        <Button onClick={signOut} className="mt-1" disabled={busy === "signout"}>
          {busy === "signout" ? "Signing out…" : "Sign out"}
        </Button>
      </div>

      {/* Deleting used to be the fourth panel here. It is its own section at
          the bottom of the page now — see DeleteAccountSettings.tsx. */}
    </>
  );
}

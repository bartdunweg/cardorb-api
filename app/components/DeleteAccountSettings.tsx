"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsHint,
  SettingsInput,
  SettingsPanel,
  SettingsPanels,
  SettingsSaid,
  dangerButtonClassName,
  settingsHintClassName,
} from "./SettingsPanel";

/**
 * The end of the account, and the end of the page.
 *
 * Split out of AccountSettings when Settings became one page: in the middle of
 * a long scroll, a red-bordered card sat between changing an email address and
 * picking a theme — ordinary traffic passing a door marked "everything goes".
 * Last on the page is where it belongs, and being last is easier to guarantee
 * as its own component than as the fourth panel inside a group.
 *
 * The confirmation is a typed word rather than a second button, because a
 * button asking "are you sure" is answered yes by the same reflex that pressed
 * the first one. Typing the username means reading it.
 *
 * No panel title: the section heading above it already says what this is.
 */
export default function DeleteAccountSettings({ username }: { username: string }) {
  const router = useRouter();

  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  async function deleteAccount() {
    if (confirm !== username) return;
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch("/api/v1/account", { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSaid(data.error ?? "That account could not be deleted.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setSaid("No answer from the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPanels>
      <SettingsPanel danger>
        <SettingsHint>
          Every card, every import and your link go with it, immediately and for good. There is no
          undo and no copy kept.
        </SettingsHint>
        <label className={settingsHintClassName} htmlFor="confirm-delete">
          Type <strong>{username}</strong> to confirm.
        </label>
        <SettingsInput
          id="confirm-delete"
          value={confirm}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button
          className={`btn ${dangerButtonClassName}`}
          type="button"
          onClick={deleteAccount}
          disabled={busy || confirm !== username}
        >
          {busy ? "Deleting…" : "Delete everything"}
        </button>
        {said && <SettingsSaid>{said}</SettingsSaid>}
      </SettingsPanel>
    </SettingsPanels>
  );
}

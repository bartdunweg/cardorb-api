"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsHint,
  SettingsInput,
  SettingsSaid,
  dangerButtonClassName,
} from "@/features/account/components/SettingsPanel";
import Button from "@/components/shared/Button";
import Modal from "@/components/shared/Modal";

/**
 * The end of the account, behind a button and a password.
 *
 * Deleting is not offered inline any more: pressing a button opens a dialog that
 * asks for the password again, so a signed-in session left open on a shared
 * machine cannot end the account in one click. The password is re-verified by
 * the route as well (see api/v1/account) — the dialog is the humane half, the
 * route the enforced one.
 */
export default function DeleteAccountSettings() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch("/api/v1/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
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
    <div>
      <SettingsHint>
        Every card, every import and your link go with it, immediately and for good. There is no
        undo and no copy kept.
      </SettingsHint>
      <Button
        color="primary-destructive"
        className={`mt-4 ${dangerButtonClassName}`}
        onClick={() => {
          setPassword("");
          setSaid(null);
          setOpen(true);
        }}
      >
        Delete account…
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} label="Delete this account">
        <form onSubmit={deleteAccount} className="shape-rectangle flex flex-col gap-4 p-6">
          <div>
            <h2 className="m-0 text-lg font-title-strong text-primary">Delete this account?</h2>
            <SettingsHint>
              This removes your account and everything in it, immediately and for good. Enter your
              password to confirm.
            </SettingsHint>
          </div>
          <SettingsInput
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {/* An error, so role="alert" rather than the status default. */}
          <SettingsSaid role="alert">{said ?? ""}</SettingsSaid>
          <div className="flex justify-end gap-3">
            <Button type="button" color="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              color="primary-destructive"
              className={dangerButtonClassName}
              disabled={busy || !password}
            >
              {busy ? "Deleting…" : "Delete everything"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

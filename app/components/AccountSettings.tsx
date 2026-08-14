"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * The account, and the two ways out of it.
 *
 * Everything here already had a working endpoint and no button. Signing out,
 * changing a password, deleting an account: all built during the accounts work,
 * none of it reachable from a screen. /settings/password in particular has
 * existed the whole time with nothing linking to it — it is where a recovery
 * link lands, so it could only be reached by losing your password first.
 *
 * Deleting is last and looks like it. The confirmation is a typed word rather
 * than a second button, because a button asking "are you sure" is answered yes
 * by the same reflex that pressed the first one. Typing the username means
 * reading it.
 */
export default function AccountSettings({ email, username }: { email: string; username: string }) {
  const router = useRouter();

  const [newEmail, setNewEmail] = useState("");
  const [confirm, setConfirm] = useState("");
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

  async function deleteAccount() {
    if (confirm !== username) return;
    setBusy("delete");
    say("delete", null);
    try {
      const res = await fetch("/api/v1/account", { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        say("delete", data.error ?? "That account could not be deleted.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      say("delete", "No answer from the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="settings-panels">
      <section className="settings-panel">
        <h2 className="settings-panel-title">Email address</h2>
        <p className="settings-hint">Currently {email}.</p>
        <form onSubmit={changeEmail}>
          <input
            className="settings-input"
            type="email"
            autoComplete="email"
            placeholder="new@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button className="btn" type="submit" disabled={busy === "email" || !newEmail.trim()}>
            {busy === "email" ? "Sending…" : "Change address"}
          </button>
          {said.email && <p className="settings-said">{said.email}</p>}
        </form>
      </section>

      <section className="settings-panel">
        <h2 className="settings-panel-title">Password</h2>
        <p className="settings-hint">
          Setting a new one takes effect immediately and does not sign out your
          other devices.
        </p>
        <Link className="btn" href="/settings/password">
          Change password
        </Link>
      </section>

      <section className="settings-panel">
        <h2 className="settings-panel-title">Sign out</h2>
        <p className="settings-hint">On this device only.</p>
        <button className="btn" type="button" onClick={signOut} disabled={busy === "signout"}>
          {busy === "signout" ? "Signing out…" : "Sign out"}
        </button>
      </section>

      <section className="settings-panel settings-panel--danger">
        <h2 className="settings-panel-title">Delete this account</h2>
        <p className="settings-hint">
          Every card, every import and your link go with it, immediately and for
          good. There is no undo and no copy kept.
        </p>
        <label className="settings-hint" htmlFor="confirm-delete">
          Type <strong>{username}</strong> to confirm.
        </label>
        <input
          id="confirm-delete"
          className="settings-input"
          value={confirm}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button
          className="btn btn--danger"
          type="button"
          onClick={deleteAccount}
          disabled={busy === "delete" || confirm !== username}
        >
          {busy === "delete" ? "Deleting…" : "Delete everything"}
        </button>
        {said.delete && <p className="settings-said">{said.delete}</p>}
      </section>
    </div>
  );
}

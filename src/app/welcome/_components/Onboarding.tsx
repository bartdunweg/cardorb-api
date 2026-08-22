"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SITE_URL } from "@/lib/core/config";
import { MAX_DISPLAY_NAME, validateUsername } from "@/lib/core/account";
import AvatarPicker from "@/features/account/components/AvatarPicker";
import { useUsernameCheck, usernameSays } from "@/features/account/hooks/useUsernameCheck";
import { FormError, FormForm, FormNote } from "@/components/shared/FormField";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import SigninShell from "@/components/shared/SigninShell";
import { SettingsHint, SettingsSwitch } from "@/features/account/components/SettingsPanel";

/**
 * The four things worth asking once, before the app.
 *
 * Signing up asks for an email address and a password and nothing else, which
 * is the right trade at that moment — every extra field on a signup form is a
 * reason not to finish it. The cost is an account that then exists with a name
 * it did not choose, a public page it does not know
 * it has, and an empty collection whose screen used to say the collection was
 * unavailable. This is where those are asked instead, once, after the door.
 *
 * Every step can be skipped, and skipping writes nothing. That is the whole
 * shape of it: this is not a form that must be completed, it is four defaults
 * offered at the only moment when changing them is easy. Somebody who presses
 * Skip four times ends up exactly where they would have without this screen,
 * and everything here is in Settings afterwards.
 *
 * Each step saves against the endpoint that already owns its field rather than
 * one batched write at the end — the same argument ProfileSettings makes for
 * having no single Save button. A username goes through the claim RPC and can
 * fail on a race; a display name cannot. Saving them together would mean one
 * message having to explain which half happened.
 */

type Step = "link" | "avatar" | "sharing" | "collection";

/** The order they are asked in, which is also how far along "step 2 of 4" is. */
const ORDER: Step[] = ["link", "avatar", "sharing", "collection"];

const TITLES: Record<Step, string> = {
  link: "Pick your name",
  avatar: "Add a picture",
  sharing: "Share your collection?",
  collection: "Fill your collection",
};

export default function Onboarding({
  initial,
}: {
  initial: {
    username: string;
    displayName: string | null;
    isPublic: boolean;
    avatarUrl: string | null;
  };
}) {
  const router = useRouter();
  // The step itself rather than an index into ORDER: an index has states that
  // are not steps, and every read of it would have to handle a step that does
  // not exist. Counting for "step 2 of 4" is the one thing that wants a number,
  // and it is derived where it is needed.
  const [step, setStep] = useState<Step>("link");
  const at = ORDER.indexOf(step);

  const [username, setUsername] = useState(initial.username);
  // A name given at signup is shown back, because it was given. What is not
  // shown back is a display name that is only a copy of the username: signup
  // stopped seeding that, but rows written before it did still hold
  // one, and a box pre-filled with `swift-magnemite-4821` invites you to keep
  // it. The placeholder already says what an empty box means.
  const [displayName, setDisplayName] = useState(
    initial.displayName && initial.displayName !== initial.username ? initial.displayName : "",
  );
  const [isPublic, setIsPublic] = useState(initial.isPublic);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wanted = username.trim().toLowerCase();
  const nameChanged = wanted !== initial.username;
  const shape = validateUsername(wanted);

  // The same check Settings > Profile makes, in the same hook — see
  // useUsernameCheck.ts for why a live answer is a courtesy and the database is
  // the guarantee.
  const name = useUsernameCheck(username, initial.username);
  const says = usernameSays(name, wanted);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/v1/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return true;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(data.error ?? "That could not be saved.");
    return false;
  }

  /** Save whatever this step holds, then move on. Skip calls next() directly. */
  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (step === "link") {
        if (nameChanged) {
          if (!shape.ok) {
            setError(shape.error);
            return;
          }
          const res = await fetch("/api/v1/username", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: wanted }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            setError(data.error ?? "That name could not be claimed.");
            return;
          }
        }
        const typed = displayName.trim();
        if (
          typed &&
          typed !== (initial.displayName ?? "") &&
          !(await patch({ displayName: typed }))
        ) {
          return;
        }
      }

      if (step === "sharing" && isPublic !== initial.isPublic) {
        if (!(await patch({ isPublic }))) return;
      }

      next();
    } catch {
      setError("No answer from the server.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setError(null);
    // The last step has no next: it ends in finish() instead, so there is
    // nothing after "collection" to move to and nothing to guard against.
    const after = ORDER[at + 1];
    if (after) setStep(after);
  }

  /**
   * The end, whichever of the four ways out was pressed.
   *
   * The stamp goes in before the navigation and the navigation waits for it: the
   * (app) layout sends an account with no stamp straight back here, so leaving
   * first would be a redirect loop rather than a saved setting. A failure keeps
   * you on the step with the message, which is the only honest option — there
   * is nowhere to go until this write lands.
   */
  async function finish(to: string) {
    setBusy(true);
    setError(null);
    try {
      if (!(await patch({ onboarded: true }))) return;
      router.replace(to);
    } catch {
      setError("No answer from the server.");
    } finally {
      setBusy(false);
    }
  }

  const link = `${SITE_URL}/user/${wanted || initial.username}`.replace(/^https?:\/\//, "");

  return (
    <SigninShell title={TITLES[step]}>
      <p className="m-0 text-center text-xs text-tertiary" aria-live="polite">
        Step {at + 1} of {ORDER.length}
      </p>

      {step === "link" && (
        <FormForm
          layout="column"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FormNote>
            You have a name already — we made one up so you would have a link from the first minute.
            This is where you change it to yours.
          </FormNote>

          <Input
            label="Username"
            hint={<>{link} — two to thirty characters: lowercase letters, numbers and hyphens.</>}
            value={username}
            onChange={(value) => setUsername(value.toLowerCase())}
            // React Aria types this as the HTML attribute, which is the string
            // "false" and not the boolean. Both spell the same thing to a
            // browser; only one type-checks.
            spellCheck="false"
            // autoCapitalize="none" was here and Untitled UI's InputProps does
            // not carry it. Dropped rather than worked around, because onChange
            // lowercases every keystroke anyway: the most a phone keyboard can
            // now do is offer a capital that the field immediately undoes.
            autoComplete="off"
            isDisabled={busy}
            isInvalid={name.kind === "taken"}
            className="w-full"
          />

          {/* One line, replacing itself, rather than three that can all be on
              screen at once saying different things about the same field.
              Always mounted, empty or not: a live region that is inserted at
              the moment it has something to say is a live region screen
              readers routinely do not announce. */}
          <FormError aria-live="polite">{says ?? ""}</FormError>

          <Input
            label="Display name"
            hint="What your page calls you. Empty means your username."
            value={displayName}
            maxLength={MAX_DISPLAY_NAME}
            placeholder={wanted || initial.username}
            onChange={setDisplayName}
            isDisabled={busy}
            className="w-full"
          />

          {/* A name the check has already said no to is not worth a round trip
              to be told again. Skip stays live, so this cannot trap anybody. */}
          <Controls busy={busy} blocked={name.kind === "taken"} error={error} onSkip={next} />
        </FormForm>
      )}

      {step === "avatar" && (
        <div className="flex flex-col items-stretch gap-4 w-full">
          <FormNote>
            Shown beside your collection and on your page. You can change it whenever you like.
          </FormNote>
          <AvatarPicker initial={initial.avatarUrl} fallback={displayName || wanted} />
          <Controls busy={busy} error={error} onSkip={next} onContinue={next} label="Continue" />
        </div>
      )}

      {step === "sharing" && (
        <div className="flex flex-col items-stretch gap-4 w-full">
          <SettingsSwitch
            checked={isPublic}
            disabled={busy}
            onChange={(e) => setIsPublic(e.target.checked)}
          >
            <strong className="block text-primary font-medium">
              Anyone with the link can see my collection
            </strong>
            <SettingsHint>
              Prices are never shown on the public page, whatever this says.
            </SettingsHint>
          </SettingsSwitch>
          <FormNote>
            {isPublic
              ? `Your page will be at ${link}.`
              : "While this is off, your page answers 404 — the same answer as a name nobody has taken, so it cannot be used to find out you are here."}
          </FormNote>
          <Controls busy={busy} error={error} onSkip={next} />
        </div>
      )}

      {step === "collection" && (
        <div className="flex flex-col items-stretch gap-3 w-full">
          <FormNote>
            Last one. A collection can come in from a spreadsheet, or start with a single card.
          </FormNote>
          <Button
            color="secondary"
            size="lg"
            isDisabled={busy}
            onPress={() => void finish("/collection?add=1")}
            className="w-full"
          >
            Add my first card
          </Button>
          <Button
            color="secondary"
            size="lg"
            isDisabled={busy}
            onPress={() => void finish("/settings/import")}
            className="w-full"
          >
            Import a CSV
          </Button>
          <FormError aria-live="polite">{error ?? ""}</FormError>
          <Button
            color="tertiary"
            size="lg"
            isDisabled={busy}
            onPress={() => void finish("/collection")}
            className="self-center"
          >
            I&apos;ll do this later
          </Button>
          {/* All three ways out do the same write first, so one line covers
              them rather than each button rewriting its own label. */}
          {busy && <FormNote className="text-center">One moment…</FormNote>}
        </div>
      )}
    </SigninShell>
  );
}

/**
 * Continue and Skip, in that order and always both.
 *
 * Skip is a button and not a link, and it is on every step including the ones
 * that have something to save: a step that cannot be got past is a step that
 * can strand somebody outside the app because an endpoint is having a bad
 * minute, and none of these four answers is worth that.
 */
function Controls({
  busy,
  blocked = false,
  error,
  onSkip,
  onContinue,
  label = "Save and continue",
}: {
  busy: boolean;
  /** Something on the step is already known not to save — a taken username.
   *  Stops Continue only; Skip is never blocked. */
  blocked?: boolean;
  error: string | null;
  onSkip: () => void;
  onContinue?: () => void;
  label?: string;
}) {
  return (
    <>
      {/* Mounted whether or not there is anything to say, so the announcement
          happens on the change rather than on the insertion. */}
      <FormError aria-live="polite">{error ?? ""}</FormError>
      {/* Continue submits when nothing else is handed in, which is what keeps
          Enter working from inside the fields. onPress is React Aria's, so it
          fires the same for a tap, a keyboard Enter and a screen reader. */}
      <Button
        type={onContinue ? "button" : "submit"}
        size="lg"
        isDisabled={busy || blocked}
        isLoading={busy}
        showTextWhileLoading
        onPress={onContinue}
        className="w-full"
      >
        {label}
      </Button>
      <Button color="tertiary" size="lg" isDisabled={busy} onPress={onSkip} className="self-center">
        Skip
      </Button>
    </>
  );
}

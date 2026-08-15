"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "./Modal";
import type { CardFields } from "../../lib/core/collection-row";
import { modalCardAddClassName } from "./cardModalClasses";

/**
 * The form behind the plus: one card, eight columns, straight into Notion.
 *
 * The suggestions come from the database rather than from a list written down
 * beside it, so a set added in Notion this morning is offered here this
 * afternoon and a renamed rarity does not leave the form offering the old name.
 * They are fetched when the dialog opens, with the same request the profile
 * screen signs in with.
 *
 * Set, Rarity and Gen are inputs over a datalist rather than selects, and that
 * is the point of them: forty sets exist and the one you have just opened a
 * pack of may not be one of them. Notion creates a select option it has not
 * seen, so typing a new set name is how a set released this morning gets a row
 * at all. Type is chips, because seven stable options are not worth typing.
 */

/** The eight columns as the form holds them. */
type Draft = {
  name: string;
  number: string;
  set: string;
  rarity: string;
  gen: string;
  types: string[];
  collection: boolean;
  excluded: boolean;
};

const cardAddLabelClassName =
  "[font-family:var(--font-main)] [font-size:var(--fs-small)] [font-weight:var(--fw-eyebrow)]" +
  " text-label-secondary p-0 [float:none]";

// The GLASS CONTROL / CONTROL recipe .card-add-field input used to read from
// components.css's grouped selectors, alongside .btn/.cards-search/
// .filter-menu > summary. This is the Tailwind copy, kept in sync by hand the
// same way FormField.tsx's FormInput carries its own copy of the same idea
// for a different control.
const cardAddInputClassName =
  "h-[var(--control-h)] border border-[var(--glass-border)] bg-[var(--glass-bg-solid)] rounded-pill " +
  "[backdrop-filter:blur(var(--blur-glass))] [box-shadow:var(--shadow-card)] text-label " +
  "[font-family:var(--font-main)] [font-size:var(--fs-control-label)] [font-weight:var(--fw-button)] " +
  "placeholder:text-label-tertiary dark:border-[var(--glass-border-control)] " +
  "hover:[box-shadow:var(--shadow-elevated)] focus-visible:[border-color:var(--color-border-active)]";

const EMPTY: Draft = {
  name: "",
  number: "",
  set: "",
  rarity: "",
  gen: "",
  types: [],
  collection: true,
  excluded: false,
};

export default function CardAddDialog({
  open,
  onClose,
  onUnauthorised,
}: {
  open: boolean;
  onClose: () => void;
  /** The key stopped working: the page signs out rather than keep a dead one. */
  onUnauthorised: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [fields, setFields] = useState<CardFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = useCallback(<K extends keyof Draft>(field: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // The portfolio served both of these off one /api/cards; here the read and
    // the write are separate endpoints, so the suggestions come from /v1/fields.
    //
    // No x-cards-key header any more: the session cookie is httpOnly, so this
    // page cannot read the key to send it, and does not have to. Same-origin
    // fetch sends the cookie on its own, and the guard accepts either.
    fetch("/api/v1/fields")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          onUnauthorised();
          return;
        }
        if (!res.ok) return;
        setFields((await res.json()) as CardFields);
      })
      // A dialog with no suggestions is a dialog you can still type a card
      // into, so a failure here is not worth a message. Every field is free
      // text; only the convenience is missing.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, onUnauthorised]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const res = await fetch("/api/v1/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.status === 401) {
        onUnauthorised();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "The card was not added.");
        return;
      }
      setAdded(draft.name);
      // Set and Gen survive, the rest does not. Cards arrive by the pack, and
      // retyping the set nine times is the form fighting the way it is used.
      setDraft({ ...EMPTY, set: draft.set, gen: draft.gen });
      // The row exists; the page in front of it is still the one from before.
      // The route has already dropped the caches behind it, so this is what
      // asks for the new render.
      router.refresh();
    } catch {
      setError("No answer from the server. The card may not have been added.");
    } finally {
      setBusy(false);
    }
  }

  const suggest = (id: string, options: string[] | undefined) =>
    options?.length ? (
      <datalist id={id}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    ) : null;

  return (
    <Modal open={open} onClose={onClose} label="Add a card" className={modalCardAddClassName}>
      <form
        className="card-add grid grid-cols-2 gap-4
          [@media(max-width:480px)]:grid-cols-1"
        onSubmit={submit}
      >
        <h2
          className="col-span-full m-0 [font-family:var(--font-main)] [font-weight:var(--fw-title)]
            [font-size:var(--fs-card)] [line-height:var(--lh-tight)] text-label"
        >
          Add a card
        </h2>
        {/* The order a card is read off its face: what it is, then where it is
            from, then what kind of printing. */}
        <label className="col-span-full flex flex-col gap-2 min-w-0 m-0 p-0 border-0">
          <span className={cardAddLabelClassName}>Name</span>
          <input
            className={cardAddInputClassName}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            required
            autoComplete="off"
            placeholder="Charizard ex"
          />
        </label>

        <label className="flex flex-col gap-2 min-w-0 m-0 p-0 border-0">
          <span className={cardAddLabelClassName}>Number</span>
          <input
            className={cardAddInputClassName}
            value={draft.number}
            onChange={(e) => set("number", e.target.value)}
            autoComplete="off"
            // Zero-padded, because that is how the rest of the database is
            // written and how the artwork lookup finds a scan first time.
            placeholder="006"
          />
        </label>

        <label className="flex flex-col gap-2 min-w-0 m-0 p-0 border-0">
          <span className={cardAddLabelClassName}>Set</span>
          <input
            className={cardAddInputClassName}
            value={draft.set}
            onChange={(e) => set("set", e.target.value)}
            required
            list="card-add-sets"
            autoComplete="off"
            placeholder="151"
          />
        </label>
        {suggest("card-add-sets", fields?.sets)}

        <label className="flex flex-col gap-2 min-w-0 m-0 p-0 border-0">
          <span className={cardAddLabelClassName}>Rarity</span>
          <input
            className={cardAddInputClassName}
            value={draft.rarity}
            onChange={(e) => set("rarity", e.target.value)}
            list="card-add-rarities"
            autoComplete="off"
            placeholder="Holo"
          />
        </label>
        {suggest("card-add-rarities", fields?.rarities)}

        <label className="flex flex-col gap-2 min-w-0 m-0 p-0 border-0">
          <span className={cardAddLabelClassName}>Generation</span>
          <input
            className={cardAddInputClassName}
            value={draft.gen}
            onChange={(e) => set("gen", e.target.value)}
            list="card-add-gens"
            autoComplete="off"
            placeholder="Scarlet &amp; Violet"
          />
        </label>
        {suggest("card-add-gens", fields?.gens)}

        {/* A group rather than a label: the name below belongs to the set of
            chips, not to any one of them. */}
        {fields?.types?.length ? (
          <fieldset className="col-span-full flex flex-col gap-2 min-w-0 m-0 p-0 border-0">
            <legend className={cardAddLabelClassName}>Type</legend>
            <div className="flex flex-wrap gap-2">
              {fields.types.map((type) => {
                const on = draft.types.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    className={
                      "h-[var(--control-h)] px-[var(--space-3-5)] rounded-pill [font-family:var(--font-main)]" +
                      " [font-size:var(--fs-control-label)] [font-weight:var(--fw-button)] cursor-pointer" +
                      (on
                        ? " border border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                        : " border border-[var(--color-border)] bg-transparent text-label-secondary" +
                          " hover:border-[var(--color-border-hover)] hover:text-label")
                    }
                    aria-pressed={on}
                    onClick={() =>
                      set(
                        "types",
                        on ? draft.types.filter((t) => t !== type) : [...draft.types, type],
                      )
                    }
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <label
          className="col-span-full flex items-start gap-3 [font-family:var(--font-body)]
            [font-size:var(--fs-body-s)] text-label cursor-pointer"
        >
          <input
            className="mt-[2px] [accent-color:var(--color-tint)]"
            type="checkbox"
            checked={draft.collection}
            onChange={(e) => set("collection", e.target.checked)}
          />
          <span className="flex flex-col gap-[2px]">
            In the binder
            <span className="[font-size:var(--fs-small)] text-label-tertiary">
              Off means it is wanted rather than held.
            </span>
          </span>
        </label>

        <label
          className="col-span-full flex items-start gap-3 [font-family:var(--font-body)]
            [font-size:var(--fs-body-s)] text-label cursor-pointer"
        >
          <input
            className="mt-[2px] [accent-color:var(--color-tint)]"
            type="checkbox"
            checked={draft.excluded}
            onChange={(e) => set("excluded", e.target.checked)}
          />
          <span className="flex flex-col gap-[2px]">
            Excluded
            <span className="[font-size:var(--fs-small)] text-label-tertiary">
              Keeps it out of the latest pull on the about page.
            </span>
          </span>
        </label>

        <div className="col-span-full flex justify-end">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy || !draft.name.trim() || !draft.set.trim()}
          >
            {busy ? "Adding" : "Add to the collection"}
          </button>
        </div>

        {/* Both live in the same polite region, so the outcome of a submit is
            announced whichever way it went, and neither pushes the form around
            when it arrives. */}
        <p
          className="col-span-full min-h-[var(--space-5)] m-0 [font-family:var(--font-body)]
            [font-size:var(--fs-small)] text-label-secondary"
          role="status"
        >
          {error ? (
            <span className="text-label [font-weight:var(--fw-eyebrow)]">{error}</span>
          ) : added ? (
            <span>{added} added. The page catches up in a moment.</span>
          ) : null}
        </p>
      </form>
    </Modal>
  );
}

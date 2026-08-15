"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "./Modal";
import type { CardFields } from "../../lib/core/collection-row";
import type { CardDetail } from "../../lib/core/cards";
import { modalCardAddClassName } from "./cardModalClasses";

/**
 * The form behind the plus: find the printing on TCGdex, then a handful of
 * facts about how it is held.
 *
 * Name, number, rarity and type used to be typed by hand, which is how they
 * ended up carrying whatever a Notion column once said rather than what the
 * card actually is (see docs/decisions/0030-tcgdex-source-of-truth-for-rarity-and-type.md).
 * They come from the picked TCGdex card now and are not editable here — a
 * card TCGdex has never heard of cannot be added through this dialog, which
 * is the accepted trade for not being able to type around a wrong rarity
 * again.
 *
 * Generation stays a text input over a datalist: it is a shelf the owner
 * built, not a fact TCGdex has an opinion on.
 */

type SetOption = { id: string; name: string };
type SearchResult = { id: string; number: string; name: string; setName: string; image: string | null };

/** What the form still asks for, once a card has been picked. */
type Draft = {
  gen: string;
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
  "hover:[box-shadow:var(--shadow-elevated)] focus-visible:[border-color:var(--color-border-active)] " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

const EMPTY: Draft = { gen: "", collection: true, excluded: false };

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
  const [sets, setSets] = useState<SetOption[] | null>(null);
  const [setQuery, setSetQuery] = useState("");
  const [cardQuery, setCardQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<CardDetail | null>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchToken = useRef(0);
  const cardQueryRef = useRef<HTMLInputElement>(null);
  const focusCardQueryNext = useRef(false);
  const changeButtonRef = useRef<HTMLButtonElement>(null);

  const set = useCallback(<K extends keyof Draft>(field: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
  }, []);

  const resetPick = useCallback(() => {
    setPicked(null);
    setResults(null);
    setCardQuery("");
  }, []);

  // "Change" removes the picked-card summary and brings the search input
  // back — focus would otherwise be left on a button that just unmounted.
  // A ref rather than state: nothing needs to re-render off this, only the
  // effect below, once the input it targets exists again.
  const changePick = useCallback(() => {
    resetPick();
    focusCardQueryNext.current = true;
  }, [resetPick]);

  // The result <button> a pick came from unmounts the moment the summary
  // below replaces the results list, so without this the browser drops focus
  // to <body> — disorienting for anyone not using a mouse. Same fix, both
  // directions: land on the one interactive thing the newly-shown block adds.
  useEffect(() => {
    if (focusCardQueryNext.current && cardQueryRef.current) {
      cardQueryRef.current.focus();
      focusCardQueryNext.current = false;
    } else if (picked) {
      changeButtonRef.current?.focus();
    }
  }, [picked]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // The portfolio served both of these off one /api/cards; here the read and
    // the write are separate endpoints. /v1/fields still supplies Generation's
    // suggestions; /v1/catalog/sets is TCGdex's own index, for the set picker.
    //
    // No x-cards-key header any more: the session cookie is httpOnly, so this
    // page cannot read the key to send it, and does not have to. Same-origin
    // fetch sends the cookie on its own, and the guard accepts either.
    Promise.all([fetch("/api/v1/fields"), fetch("/api/v1/catalog/sets")])
      .then(async ([fieldsRes, setsRes]) => {
        if (cancelled) return;
        if (fieldsRes.status === 401 || setsRes.status === 401) {
          onUnauthorised();
          return;
        }
        if (fieldsRes.ok) setFields((await fieldsRes.json()) as CardFields);
        if (setsRes.ok) setSets(((await setsRes.json()) as { sets: SetOption[] }).sets);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, onUnauthorised]);

  // A set is "chosen" once what's typed matches a TCGdex set name exactly,
  // case aside — searching needs the set TCGdex actually resolves it to, not
  // whatever case the user happened to type. Derived rather than tracked in
  // its own state, so there is nothing to keep in sync with setQuery.
  const chosenSet = useMemo(
    () => sets?.find((s) => s.name.toLowerCase() === setQuery.trim().toLowerCase()) ?? null,
    [sets, setQuery],
  );

  // Clears the search below whenever the resolved set changes underneath it.
  // Adjusted here, during render, rather than in an effect — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [trackedSetId, setTrackedSetId] = useState<string | null>(null);
  const nextSetId = chosenSet?.id ?? null;
  if (trackedSetId !== nextSetId) {
    setTrackedSetId(nextSetId);
    if (picked || results || cardQuery) {
      setPicked(null);
      setResults(null);
      setCardQuery("");
    }
  }

  // Debounced search inside the chosen set. An empty query lists the set, so
  // opening a set with a handful of cards is one less thing to type.
  useEffect(() => {
    if (!chosenSet) return;
    const token = ++searchToken.current;
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/v1/catalog/search?set=${encodeURIComponent(chosenSet.name)}&query=${encodeURIComponent(cardQuery)}`)
        .then(async (res) => {
          if (searchToken.current !== token) return;
          if (res.status === 401) {
            onUnauthorised();
            return;
          }
          if (!res.ok) {
            setResults([]);
            return;
          }
          setResults(((await res.json()) as { cards: SearchResult[] }).cards);
        })
        .catch(() => {
          if (searchToken.current === token) setResults([]);
        })
        .finally(() => {
          if (searchToken.current === token) setSearching(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [chosenSet, cardQuery, onUnauthorised]);

  async function pick(result: SearchResult) {
    setPickBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/catalog/cards/${encodeURIComponent(result.id)}`);
      if (res.status === 401) {
        onUnauthorised();
        return;
      }
      if (!res.ok) {
        setError("Could not read that card from TCGdex.");
        return;
      }
      const { card } = (await res.json()) as { card: CardDetail };
      setPicked(card);
    } catch {
      setError("No answer from TCGdex. Try again.");
    } finally {
      setPickBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !picked || !chosenSet) return;
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const res = await fetch("/api/v1/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: picked.name,
          number: picked.localId ?? "",
          set: chosenSet.name,
          rarity: picked.rarity ?? "",
          types: picked.types,
          gen: draft.gen,
          collection: draft.collection,
          excluded: draft.excluded,
        }),
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
      setAdded(picked.name);
      // The set survives, Gen survives, the pick does not. Cards arrive by
      // the pack: staying inside the same set is the form fighting the way
      // it is used, but the exact printing is not something the next card in
      // the pack shares.
      resetPick();
      setDraft((d) => ({ ...d, collection: EMPTY.collection, excluded: EMPTY.excluded }));
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

        <label className="col-span-full flex flex-col gap-2 min-w-0 m-0 p-0 border-0">
          <span className={cardAddLabelClassName}>Set</span>
          <input
            className={cardAddInputClassName}
            value={setQuery}
            onChange={(e) => setSetQuery(e.target.value)}
            list="card-add-sets"
            autoComplete="off"
            placeholder="Obsidian Flames"
            disabled={!!picked}
          />
        </label>
        {suggest(
          "card-add-sets",
          sets?.map((s) => s.name),
        )}
        {/* The only feedback a set name that doesn't (yet) match one of
            TCGdex's gets — otherwise typing stops and nothing visibly
            happens, which reads as broken rather than as "keep typing". */}
        {sets && setQuery.trim() && !chosenSet && !picked ? (
          <p className="col-span-full m-0 [font-size:var(--fs-small)] text-label-tertiary">
            Pick a set from the list to search its cards.
          </p>
        ) : null}

        {chosenSet && !picked ? (
          <div className="col-span-full flex flex-col gap-2 min-w-0 m-0 p-0">
            <label className="flex flex-col gap-2 min-w-0 m-0 p-0 border-0">
              <span className={cardAddLabelClassName}>Find the card</span>
              <input
                ref={cardQueryRef}
                className={cardAddInputClassName}
                value={cardQuery}
                onChange={(e) => setCardQuery(e.target.value)}
                autoComplete="off"
                placeholder="Charizard, or a number"
              />
            </label>
            {/* The list below can be read visually as it changes; a screen
                reader only hears this line, so it is the one place the
                result count (not just the empty/searching edge cases) is
                actually announced. */}
            <p className="sr-only" role="status">
              {searching
                ? "Searching…"
                : results?.length
                  ? `${results.length} card${results.length === 1 ? "" : "s"} found.`
                  : results
                    ? "No cards found in this set."
                    : ""}
            </p>
            <ul className="flex flex-col gap-1 max-h-[240px] overflow-y-auto m-0 p-0 list-none">
              {results?.length ? (
                results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 p-2 rounded-md border border-transparent
                        bg-transparent text-left cursor-pointer hover:border-[var(--color-border)]
                        hover:bg-[var(--glass-bg-solid)] disabled:cursor-wait disabled:opacity-60"
                      onClick={() => pick(r)}
                      disabled={pickBusy}
                    >
                      {r.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a search result thumbnail, not a page image worth Next's pipeline
                        <img
                          src={r.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="w-8 h-11 object-contain shrink-0"
                        />
                      ) : (
                        <span className="w-8 h-11 shrink-0" />
                      )}
                      <span className="flex flex-col min-w-0">
                        <span className="text-label truncate">{r.name}</span>
                        <span className="text-label-tertiary [font-size:var(--fs-small)]">#{r.number}</span>
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li aria-hidden="true" className="text-label-tertiary [font-size:var(--fs-small)] p-2">
                  {searching ? "Searching…" : "No cards found in this set."}
                </li>
              )}
            </ul>
          </div>
        ) : null}

        {picked ? (
          <div
            className="col-span-full flex items-center gap-3 p-3 rounded-md border border-[var(--glass-border)]
              bg-[var(--glass-bg-solid)]"
          >
            {picked.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- a small confirmation thumbnail
              <img src={picked.image} alt="" className="w-10 h-14 object-contain shrink-0" />
            ) : null}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-label">{picked.name}</span>
              <span className="text-label-tertiary [font-size:var(--fs-small)]">
                {[picked.localId && `#${picked.localId}`, chosenSet?.name, picked.rarity, picked.types.join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <button ref={changeButtonRef} type="button" className="btn" onClick={changePick}>
              Change
            </button>
          </div>
        ) : null}

        <label className="col-span-full flex flex-col gap-2 min-w-0 m-0 p-0 border-0">
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
          <button type="submit" className="btn btn--primary" disabled={busy || !picked}>
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

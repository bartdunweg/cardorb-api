"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import Modal from "./Modal";
import { MAX, type CardFields } from "../../lib/core/collection-row";
import { MAX_RESULTS, type CatalogueMatch } from "../../lib/core/ptcg-search";
import { modalCardAddClassName } from "./cardModalClasses";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { untitledButton } from "./untitledButtonClasses";

/**
 * The form behind the plus: one search box first, a few extra fields once a
 * card is found.
 *
 * "1 invoerveld voor alles" (docs/feedback/0005-add-card-should-be-one-search-bar.md):
 * typing a name, a number, a set, or a type into the same box shows matching
 * cards live, via /api/v1/catalog/search (pokemontcg.io underneath — see
 * lib/core/ptcg-search.ts for why). Picking one fills Name, Number, Set,
 * Rarity and Type from the catalogue; only Generation and the two toggles are
 * still typed by hand, because nothing indexes them.
 *
 * A card the quick box can't find gets "Advanced filters" — Name, Number,
 * Set and Type as their own fields, still searched, never a way to skip
 * search and write an unmatched row. That used to be an "Enter it by hand"
 * escape hatch; see docs/feedback/0006-add-card-no-manual-entry-escape-hatch.md
 * for why it was replaced rather than kept: a card pokemontcg.io has not
 * indexed genuinely cannot be added through this dialog any more, a
 * deliberate, known tradeoff (ADR-0032), not an oversight.
 *
 * Rarity and Type stop being editable once a match is picked (see
 * docs/decisions/0030-tcgdex-source-of-truth-for-rarity-and-type.md): they
 * used to be a text input and toggle chips a person could override, which is
 * how they ended up carrying whatever a Notion column once said rather than
 * what the card actually is. They are shown, not asked for, sourced strictly
 * from `selected` — the same catalogue match that filled Name/Number/Set.
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
  " text-secondary p-0 [float:none]";

// The GLASS CONTROL / CONTROL recipe .card-add-field input used to read from
// components.css's grouped selectors, alongside .btn/.cards-search/
// .filter-menu > summary. This is the Tailwind copy, kept in sync by hand the
// same way FormField.tsx's FormInput carries its own copy of the same idea
// for a different control.
const cardAddInputClassName =
  "h-[var(--control-h)] border border-secondary bg-primary rounded-pill " +
  "[backdrop-filter:blur(var(--blur-glass))] [box-shadow:var(--shadow-card)] text-primary " +
  "[font-family:var(--font-main)] [font-size:var(--fs-control-label)] [font-weight:var(--fw-button)] " +
  "placeholder:text-tertiary dark:border-secondary " +
  "hover:[box-shadow:var(--shadow-elevated)] focus-visible:[border-color:var(--color-border-active)]";

/** The one big field this dialog opens on — taller and louder than the rest. */
const cardAddSearchClassName =
  "h-14 w-full pl-11 pr-11 border border-secondary bg-primary rounded-2xl " +
  "[backdrop-filter:blur(var(--blur-glass))] [box-shadow:var(--shadow-card)] text-primary outline-none " +
  "[font-family:var(--font-main)] [font-size:var(--fs-card)] [font-weight:var(--fw-button)] " +
  "placeholder:text-tertiary dark:border-secondary " +
  "hover:[box-shadow:var(--shadow-elevated)] focus-visible:[border-color:var(--color-border-active)] " +
  "[&::-webkit-search-cancel-button]:hidden";

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

/** How long to let someone keep typing before a search is worth a request. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The five fields a catalogue match fills in, in one place.
 *
 * Read from two directions — a result clicked in the list (selectMatch) and a
 * card the caller opened the dialog on (`prefill`) — and they have to agree
 * exactly, because rarity and types are read-only now (ADR-0030): whatever this
 * writes is what gets submitted, with no field left for anyone to correct it in.
 */
const draftFrom = (match: CatalogueMatch, base: Draft): Draft => ({
  ...base,
  name: match.name,
  number: match.number,
  set: match.setName,
  rarity: match.rarity ?? "",
  types: match.types.slice(0, MAX.types),
});

export default function CardAddDialog({
  open,
  onClose,
  onUnauthorised,
  prefill = null,
}: {
  open: boolean;
  onClose: () => void;
  /** The key stopped working: the page signs out rather than keep a dead one. */
  onUnauthorised: () => void;
  /**
   * A card the caller has already found, opened straight into the summary the
   * search would have produced. Browse passes one; the plus button passes none.
   *
   * Not a way around search — it *is* a search result, one this dialog would
   * have shown for the same card. ADR-0032's rule is that nothing writes a row
   * the catalogue has not matched, and a prefilled CatalogueMatch is by
   * construction matched. "Change" clears it back to the search box.
   */
  prefill?: CatalogueMatch | null;
}) {
  const router = useRouter();
  /**
   * A prefilled dialog opens on the summary rather than on the search box, and
   * it does so from the initial state rather than from an effect: setting state
   * in an effect to react to a prop is the cascading render the lint rule is
   * about, and it would also fight anything typed after the first render.
   *
   * That works because AppShell remounts this component for each prefilled
   * opening — see the `key` there. The plus button keeps one instance and the
   * state it always kept.
   */
  const [draft, setDraft] = useState<Draft>(prefill ? draftFrom(prefill, EMPTY) : EMPTY);
  const [fields, setFields] = useState<CardFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CatalogueMatch[]>([]);
  const [searching, setSearching] = useState(false);
  /** True only when the request itself failed — never for a genuine zero
   *  matches — so the two stop looking identical to whoever is typing. See
   *  docs/decisions/0033-add-card-search-failure-and-paging.md. */
  const [searchFailed, setSearchFailed] = useState(false);
  /** Bumped by "Try again" to force the search effect to re-run without a
   *  new keystroke — nothing else reads its value. */
  const [retryTick, setRetryTick] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** The match a click confirmed, replacing the search area with a summary —
   *  or the one the caller opened this dialog on. See `draft` above. */
  const [selected, setSelected] = useState<CatalogueMatch | null>(prefill);
  /** Quick is the one box; advanced is Name/Number/Set/Type as their own
   *  fields — a more precise search, never a way to skip search. */
  const [mode, setMode] = useState<"quick" | "advanced">("quick");
  const [filters, setFilters] = useState({ name: "", number: "", set: "", type: "" });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const advancedNameRef = useRef<HTMLInputElement>(null);
  const changeButtonRef = useRef<HTMLButtonElement>(null);

  const set = useCallback(<K extends keyof Draft>(field: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
  }, []);
  const setFilter = useCallback((field: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [field]: value }));
  }, []);

  // Every state change in this dialog swaps out whatever DOM node held focus
  // — a result button, "Change", the search box — for a different one.
  // Without this, React drops focus to <body> on each transition, silently
  // ejecting keyboard and screen-reader users from the flow.
  useEffect(() => {
    if (open && !selected && mode === "quick") searchInputRef.current?.focus();
  }, [open, selected, mode]);
  useEffect(() => {
    if (open && !selected && mode === "advanced") advancedNameRef.current?.focus();
  }, [open, selected, mode]);
  useEffect(() => {
    if (open && selected) changeButtonRef.current?.focus();
  }, [open, selected]);

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

  const buildParams = useCallback(
    (forPage: number) => {
      const params = new URLSearchParams();
      if (mode === "quick") {
        params.set("query", query.trim());
      } else {
        for (const [key, value] of Object.entries(filters)) {
          if (value.trim()) params.set(key, value.trim());
        }
      }
      params.set("page", String(forPage));
      return params;
    },
    [mode, query, filters],
  );

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    const hasFilters = Object.values(filters).some((v) => v.trim());
    // No search once a card is picked (nothing left to find). Both branches,
    // and the "too short"/"no filters" one below, go through a timer so
    // every setState here happens from inside it rather than synchronously
    // from the effect body.
    const active = !selected && (mode === "quick" ? term.length >= 2 : hasFilters);
    let cancelled = false;
    const controller = new AbortController();
    // Flips `searching` on the very next tick, well before the debounced
    // fetch below actually goes out. Without this, `searching` stayed
    // false — and any leftover `matches` from a moment ago stayed put — for
    // the whole SEARCH_DEBOUNCE_MS window, which is long enough that "no
    // matches for X" rendered before a request had even been sent for X.
    const immediate = setTimeout(() => {
      if (!active) {
        setMatches([]);
        setSearching(false);
        setSearchFailed(false);
        setHasMore(false);
        setPage(1);
        return;
      }
      setSearching(true);
      setSearchFailed(false);
    }, 0);
    const timer = !active
      ? null
      : setTimeout(() => {
          // A retry or a fresh keystroke both start over at page 1 — "Show
          // more results" is the only thing allowed to move past it.
          fetch(`/api/v1/catalog/search?${buildParams(1)}`, { signal: controller.signal })
            .then(async (res) => {
              if (cancelled) return;
              if (res.status === 401) {
                onUnauthorised();
                return;
              }
              // 502 is searchCards() itself failing (pokemontcg.io down or
              // rate-limited), distinct from the 400 this dialog never sends
              // once `active` is true — see the route's own comment. Both
              // used to render as an empty grid; that was the bug.
              if (!res.ok) {
                setSearchFailed(true);
                setMatches([]);
                setHasMore(false);
                return;
              }
              const body = (await res.json()) as { cards: CatalogueMatch[] };
              const cards = body.cards ?? [];
              setMatches(cards);
              setPage(1);
              setHasMore(cards.length === MAX_RESULTS);
            })
            .catch(() => {
              if (!cancelled) {
                setSearchFailed(true);
                setMatches([]);
                setHasMore(false);
              }
            })
            .finally(() => {
              if (!cancelled) setSearching(false);
            });
        }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(immediate);
      if (timer) clearTimeout(timer);
    };
    // retryTick isn't read inside — it exists purely to force this effect to
    // run again on "Try again", without a new keystroke changing anything else.
  }, [open, query, filters, mode, selected, onUnauthorised, retryTick, buildParams]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetch(`/api/v1/catalog/search?${buildParams(nextPage)}`);
      if (res.status === 401) {
        onUnauthorised();
        return;
      }
      if (!res.ok) {
        // A later page failing doesn't invalidate the results already on
        // screen — leave them, leave the button, so a click can just retry.
        return;
      }
      const body = (await res.json()) as { cards: CatalogueMatch[] };
      const cards = body.cards ?? [];
      setMatches((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...cards.filter((c) => !seen.has(c.id))];
      });
      setPage(nextPage);
      setHasMore(cards.length === MAX_RESULTS);
    } catch {
      // Same posture as above: stay put, let another click retry.
    } finally {
      setLoadingMore(false);
    }
  }

  function selectMatch(match: CatalogueMatch) {
    // Rarity and types mirror the match exactly, not a fallback onto whatever
    // a previous pick left in `d` — they are read-only now (see the top-of-
    // file comment), so what gets submitted has to be what the summary below
    // actually shows, not a stale leftover from an earlier card this session.
    setDraft((d) => draftFrom(match, d));
    setSelected(match);
    setMatches([]);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    setFilters({ name: "", number: "", set: "", type: "" });
    setDraft((d) => ({ ...d, name: "", number: "", set: "", rarity: "", types: [] }));
    setMatches([]);
    setSearchFailed(false);
    setHasMore(false);
    setPage(1);
  }

  function enterAdvanced() {
    setMode("advanced");
    setMatches([]);
    setSearchFailed(false);
    setHasMore(false);
    setPage(1);
    setFilters((f) => ({ ...f, name: f.name || query.trim() }));
  }

  function backToQuick() {
    setMode("quick");
    setMatches([]);
    setSearchFailed(false);
    setHasMore(false);
    setPage(1);
    setQuery((q) => q || filters.name.trim());
  }

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
      setSelected(null);
      setQuery("");
      setFilters({ name: "", number: "", set: "", type: "" });
      setMatches([]);
      setSearchFailed(false);
      setHasMore(false);
      setPage(1);
      // No "current set" to keep across submissions any more: every card
      // comes from picking a fresh match, which brings its own Set. Only Gen
      // (never catalogue-derived) is worth carrying to the next one.
      setDraft((d) => ({ ...EMPTY, gen: d.gen }));
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

  const ready = selected !== null;
  const hasFilters = Object.values(filters).some((v) => v.trim());

  return (
    <Modal open={open} onClose={onClose} label="Add a card" className={modalCardAddClassName}>
      <form className="card-add flex flex-col gap-4" onSubmit={submit}>
        <h2
          className="m-0 [font-family:var(--font-main)] [font-weight:var(--fw-title)]
            [font-size:var(--fs-card)] [line-height:var(--lh-tight)] text-primary"
        >
          Add a card
        </h2>

        {!ready && (
          <>
            {mode === "quick" ? (
              <div className="relative">
                <Search
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tertiary"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  className={cardAddSearchClassName}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                  placeholder="Search for a card"
                  aria-label="Search for a card by name, number, set or type"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear the search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center
                      w-7 h-7 rounded-full text-tertiary hover:text-primary cursor-pointer"
                  >
                    <X size={16} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 [@media(max-width:480px)]:grid-cols-1">
                <Input
                  label="Name"
                  ref={advancedNameRef}
                  value={filters.name}
                  onChange={(v) => setFilter("name", v)}
                  autoComplete="off"
                  placeholder="Charizard"
                  className="col-span-full"
                />
                <Input
                  label="Number"
                  value={filters.number}
                  onChange={(v) => setFilter("number", v)}
                  autoComplete="off"
                  placeholder="006"
                />
                {/* Still a native input with a <datalist>, where Name and
                    Number above are Untitled UI's. Its Input has no `list`
                    prop, and Untitled UI's answer to "field that suggests" is
                    Combobox — a different interaction (ARIA listbox, and it
                    wants allowsCustomValue to keep free text working). That is
                    a change worth making on purpose rather than at the end of a
                    sweep. ADR-0059 has the choice; until it is taken, these
                    three keep the behaviour they have. */}
                <label className="flex flex-col gap-2 min-w-0 m-0 p-0 border-0">
                  <span className={cardAddLabelClassName}>Set</span>
                  <input
                    className={cardAddInputClassName}
                    value={filters.set}
                    onChange={(e) => setFilter("set", e.target.value)}
                    list="card-add-sets"
                    autoComplete="off"
                    placeholder="151"
                  />
                </label>
                {suggest("card-add-sets", fields?.sets)}
                <label className="flex flex-col gap-2 min-w-0 m-0 p-0 border-0">
                  <span className={cardAddLabelClassName}>Type</span>
                  <input
                    className={cardAddInputClassName}
                    value={filters.type}
                    onChange={(e) => setFilter("type", e.target.value)}
                    list="card-add-filter-types"
                    autoComplete="off"
                    placeholder="Fire"
                  />
                </label>
                {suggest("card-add-filter-types", fields?.types)}
              </div>
            )}

            {/* Always mounted, text swapped rather than the node appearing
                and disappearing: some screen readers miss a role="status"
                region that arrives and changes content in the same tick,
                and "no matches" needs announcing exactly as much as
                "searching" does. searchFailed takes priority over every
                other message here — it is never true at the same time as a
                genuine "no matches", see the search effect. */}
            <p
              className="m-0 min-h-[1.2em] [font-size:var(--fs-tiny)] text-tertiary"
              role="status"
            >
              {searchFailed ? (
                <>
                  Search is temporarily unavailable.{" "}
                  <button
                    type="button"
                    onClick={() => setRetryTick((t) => t + 1)}
                    className="underline cursor-pointer text-secondary hover:text-primary"
                  >
                    Try again
                  </button>
                  .
                </>
              ) : searching && matches.length === 0 ? (
                "Searching…"
              ) : !searching &&
                matches.length === 0 &&
                (mode === "quick" ? query.trim().length >= 2 : hasFilters) ? (
                mode === "quick" ? (
                  `No matches for "${query.trim()}".`
                ) : (
                  "No matches for these filters."
                )
              ) : null}
            </p>

            {matches.length > 0 && (
              <div
                className="grid grid-cols-3 gap-3 [@media(min-width:480px)]:grid-cols-4"
                role="group"
                aria-label="Cards matching your search"
              >
                {matches.map((match) => (
                  <button
                    key={match.id}
                    type="button"
                    className="flex flex-col items-center gap-1 p-2 rounded-orb-lg border border-transparent
                      text-center cursor-pointer hover:border-[var(--color-border)]"
                    // The image alt is decorative context, not the whole
                    // story: a card with no scan renders no img at all, so
                    // the button needs its own name rather than depending on
                    // optional alt text.
                    aria-label={`${match.name}, ${match.setName}, number ${match.number}`}
                    onClick={() => selectMatch(match)}
                  >
                    {match.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="w-full aspect-[245/342] object-contain
                          [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.15))]"
                        src={match.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        // Same low-then-high retry CardItem.tsx uses for the
                        // main grid, at thumbnail scale.
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (img.dataset.retried || !match.imageHigh) return;
                          img.dataset.retried = "1";
                          img.src = match.imageHigh;
                        }}
                      />
                    ) : null}
                    <span
                      className="[font-size:var(--fs-tiny)] [font-weight:var(--fw-eyebrow)] text-primary
                        line-clamp-1 w-full"
                    >
                      {match.name}
                    </span>
                    <span className="[font-size:var(--fs-tiny)] text-tertiary tabular-nums truncate w-full">
                      {match.setName} · #{match.number}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {hasMore && !searching && !searchFailed && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="self-center [font-size:var(--fs-small)] text-secondary underline
                  cursor-pointer hover:text-primary disabled:cursor-default disabled:no-underline
                  disabled:text-tertiary"
              >
                {loadingMore ? "Loading more…" : "Show more results"}
              </button>
            )}

            <p className="m-0 [font-size:var(--fs-small)] text-tertiary">
              {mode === "quick" ? (
                <>
                  Looking for something specific?{" "}
                  <button
                    type="button"
                    onClick={enterAdvanced}
                    className="underline cursor-pointer text-secondary hover:text-primary"
                  >
                    Advanced filters
                  </button>
                  .
                </>
              ) : (
                <button
                  type="button"
                  onClick={backToQuick}
                  className="underline cursor-pointer text-secondary hover:text-primary"
                >
                  Back to quick search
                </button>
              )}
            </p>
          </>
        )}

        {selected && (
          <div className="flex items-center gap-3">
            {selected.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="w-16 aspect-[245/342] object-contain shrink-0
                  [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.15))]"
                src={selected.image}
                alt=""
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.dataset.retried || !selected.imageHigh) return;
                  img.dataset.retried = "1";
                  img.src = selected.imageHigh;
                }}
              />
            ) : null}
            <div className="flex flex-col gap-[2px] min-w-0 flex-1">
              <span
                className="[font-family:var(--font-main)] [font-weight:var(--fw-title)]
                  [font-size:var(--fs-body-s)] text-primary truncate"
              >
                {selected.name}
              </span>
              <span className="[font-size:var(--fs-small)] text-tertiary truncate">
                {selected.setName} · #{selected.number}
              </span>
            </div>
            <button
              ref={changeButtonRef}
              type="button"
              className={untitledButton({ color: "secondary", className: "shrink-0" })}
              onClick={clearSelection}
            >
              Change
            </button>
          </div>
        )}

        {ready && (
          <div className="grid grid-cols-2 gap-4 [@media(max-width:480px)]:grid-cols-1">
            {/* Shown, not asked for — see the top-of-file comment. Both come
                straight off `selected`, the same match Name/Number/Set did,
                so there is nothing here to type around any more. */}
            <div className="flex flex-col gap-2 min-w-0 m-0 p-0">
              <span className={cardAddLabelClassName}>Rarity</span>
              <p className="m-0 [font-size:var(--fs-control-label)] text-primary">
                {selected?.rarity ?? "Unknown"}
              </p>
            </div>

            <div className="flex flex-col gap-2 min-w-0 m-0 p-0">
              <span className={cardAddLabelClassName}>Type</span>
              <p className="m-0 [font-size:var(--fs-control-label)] text-primary">
                {selected?.types.length ? selected.types.join(", ") : "Unknown"}
              </p>
            </div>

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
                [font-size:var(--fs-body-s)] text-primary cursor-pointer"
            >
              <input
                className="mt-[2px] [accent-color:var(--color-tint)]"
                type="checkbox"
                checked={draft.collection}
                onChange={(e) => set("collection", e.target.checked)}
              />
              <span className="flex flex-col gap-[2px]">
                In the binder
                <span className="[font-size:var(--fs-small)] text-tertiary">
                  Off means it is wanted rather than held.
                </span>
              </span>
            </label>

            <label
              className="col-span-full flex items-start gap-3 [font-family:var(--font-body)]
                [font-size:var(--fs-body-s)] text-primary cursor-pointer"
            >
              <input
                className="mt-[2px] [accent-color:var(--color-tint)]"
                type="checkbox"
                checked={draft.excluded}
                onChange={(e) => set("excluded", e.target.checked)}
              />
              <span className="flex flex-col gap-[2px]">
                Excluded
                <span className="[font-size:var(--fs-small)] text-tertiary">
                  Keeps it out of the latest pull on the about page.
                </span>
              </span>
            </label>

            <div className="col-span-full flex justify-end">
              <Button
                type="submit"
                size="lg"
                isDisabled={busy || !draft.name.trim() || !draft.set.trim()}
                isLoading={busy}
                showTextWhileLoading
              >
                Add to the collection
              </Button>
            </div>

            {/* Both live in the same polite region, so the outcome of a
                submit is announced whichever way it went, and neither pushes
                the form around when it arrives. */}
            <p
              className="col-span-full min-h-5 m-0 [font-family:var(--font-body)]
                [font-size:var(--fs-small)] text-secondary"
              role="status"
            >
              {error ? (
                <span className="text-primary [font-weight:var(--fw-eyebrow)]">{error}</span>
              ) : added ? (
                <span>{added} added. The page catches up in a moment.</span>
              ) : null}
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}

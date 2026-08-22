"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchLg, XClose } from "@untitledui-pro/icons/line";
import Modal from "@/components/shared/Modal";
import { MAX, type CardFields } from "@/lib/core/collection-row";
import { MAX_RESULTS, type CatalogueMatch } from "@/lib/core/ptcg-search";
import { modalCardAddClassName } from "@/features/collection/components/cardModalClasses";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input, InputBase } from "@/components/base/input/input";
import { ComboBox } from "@/components/base/select/combobox";
import { SelectItem } from "@/components/base/select/select-item";
import { untitledButton } from "@/components/shared/untitledButtonClasses";

/**
 * The form behind the plus: one search box first, a few extra fields once a
 * card is found.
 *
 * "1 invoerveld voor alles" (git history):
 * typing a name, a number, a set, or a type into the same box shows matching
 * cards live, via /api/v1/catalog/search (pokemontcg.io underneath — see
 * lib/core/ptcg-search.ts for why). Picking one fills Name, Number, Set,
 * Rarity and Type from the catalogue; only Generation and the two toggles are
 * still typed by hand, because nothing indexes them.
 *
 * A card the quick box can't find gets "Advanced filters" — Name, Number,
 * Set and Type as their own fields, still searched, never a way to skip
 * search and write an unmatched row. That used to be an "Enter it by hand"
 * escape hatch; see git history
 * for why it was replaced rather than kept: a card pokemontcg.io has not
 * indexed genuinely cannot be added through this dialog any more, a
 * deliberate, known tradeoff, not an oversight.
 *
 * Rarity and Type stop being editable once a match is picked (see
 * git history): they
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
  "font-body text-xs font-semibold" + " text-secondary p-0 [float:none]";

/**
 * Two functional overrides on the search field, and nothing about how big it is.
 *
 * It used to carry four more — `h-14` (56px), `text-display-xs` (24px),
 * `font-bold`, and `rounded-2xl` on the wrapper — to make this field "taller and
 * louder than the rest". That was a real intent, written down in place, and it
 * still lost to the standing rule: Untitled UI wins unless
 * the product identity or a measurement earns the exception, and wanting
 * emphasis is neither. Their `lg` is `text-md` at 16px; this was rendering at 24.
 *
 * It also had a defect underneath the taste question. `inputClassName` styles
 * the `<input>`, not the placeholder, so `text-display-xs font-bold` applied to
 * whatever somebody *typed* — a card name entered at 24px bold, which nobody
 * asked for.
 *
 * What is left is the two things that are not styling:
 *
 * `pr-11` — room for the clear button, which is absolutely positioned outside
 * `InputBase` because their trailing slot is for a tooltip or the invalid icon,
 * not for an action. Without it the X sits on top of the text.
 *
 * `[&::-webkit-search-cancel-button]:hidden` — `type="search"` gives WebKit its
 * own native clear button, which would sit beside ours and do the same thing.
 */
const cardAddSearchInputClassName = "pr-11 [&::-webkit-search-cancel-button]:hidden";

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
 * exactly, because rarity and types are read-only now: whatever this
 * writes is what gets submitted, with no field left for anyone to correct it in.
 */
const draftFrom = (match: CatalogueMatch, base: Draft): Draft => ({
  ...base,
  name: match.name,
  number: match.number,
  set: match.setName,
  rarity: match.rarity ?? "",
  types: match.types.slice(0, MAX.types),
  // The era comes off the match too, and for the same reason as the two above
  // it is a fact about the card, not a
  // judgement about the copy. It was the last field here anybody typed, and the
  // collection already carried one "Scarlett & Violet" to show for it.
  gen: match.series ?? "",
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
   * have shown for the same card. The rule is that nothing writes a row
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
   *  git history. */
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

  /**
   * The catalogue's suggestions, in the shape ComboBox's listbox wants.
   *
   * `id` and `label` are the same string on purpose: these are free-text
   * filters, not a set of keyed options, and `allowsCustomValue` means what the
   * field holds does not have to be one of them.
   */
  const comboItems = (options: string[] | undefined) =>
    (options ?? []).map((option) => ({ id: option, label: option }));

  const ready = selected !== null;
  const hasFilters = Object.values(filters).some((v) => v.trim());

  return (
    <Modal open={open} onClose={onClose} label="Add a card" className={modalCardAddClassName}>
      <form className="card-add flex flex-col gap-4" onSubmit={submit}>
        <h2
          className="m-0 font-body font-medium
            text-display-xs leading-tight text-primary"
        >
          Add a card
        </h2>

        {!ready && (
          <>
            {mode === "quick" ? (
              <div className="relative">
                {/* `InputBase` carries the leading icon, so the absolutely
                    positioned `<SearchLg>` that used to sit here is gone. The
                    clear button below stays outside it — their trailing slot
                    is for a tooltip or the invalid icon, not an action. */}
                <InputBase
                  ref={searchInputRef}
                  icon={SearchLg}
                  size="lg"
                  type="search"
                  inputClassName={cardAddSearchInputClassName}
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
                    <XClose size={16} strokeWidth={1.75} />
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
                {/* Untitled UI's `ComboBox`. The swap was deferred once rather
                    than rejected: it was called the right end state and turned
                    down on timing, not on merit.

                    `allowsCustomValue` is the whole reason it can replace a
                    `<datalist>` at all. A datalist is a hint: the field is a
                    plain text input and typing something off the list is
                    ordinary. Without that prop a ComboBox would clear anything
                    that does not match, which would silently break adding a
                    card from a set the catalogue has not indexed yet.

                    `menuTrigger="focus"` (the component's own default) keeps
                    the other half of the datalist behaviour: suggestions on
                    focus, not only after typing.

                    What is genuinely gained is a real
                    ARIA combobox with a managed listbox, instead of suggestions
                    the browser draws in its own chrome and a screen reader
                    announces inconsistently. */}
                <ComboBox
                  label="Set"
                  aria-label="Set"
                  allowsCustomValue
                  shortcut={false}
                  inputValue={filters.set}
                  onInputChange={(v) => setFilter("set", v)}
                  placeholder="151"
                  items={comboItems(fields?.sets)}
                >
                  {(item) => <SelectItem id={item.id} label={item.label} />}
                </ComboBox>
                <ComboBox
                  label="Type"
                  aria-label="Type"
                  allowsCustomValue
                  shortcut={false}
                  inputValue={filters.type}
                  onInputChange={(v) => setFilter("type", v)}
                  placeholder="Fire"
                  items={comboItems(fields?.types)}
                >
                  {(item) => <SelectItem id={item.id} label={item.label} />}
                </ComboBox>
              </div>
            )}

            {/* Always mounted, text swapped rather than the node appearing
                and disappearing: some screen readers miss a role="status"
                region that arrives and changes content in the same tick,
                and "no matches" needs announcing exactly as much as
                "searching" does. searchFailed takes priority over every
                other message here — it is never true at the same time as a
                genuine "no matches", see the search effect. */}
            <p className="m-0 min-h-[1.2em] text-xs text-tertiary" role="status">
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
                      text-center cursor-pointer hover:border-secondary"
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
                      className="text-xs font-semibold text-primary
                        line-clamp-1 w-full"
                    >
                      {match.name}
                    </span>
                    <span className="text-xs text-tertiary tabular-nums truncate w-full">
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
                className="self-center text-xs text-secondary underline
                  cursor-pointer hover:text-primary disabled:cursor-default disabled:no-underline
                  disabled:text-tertiary"
              >
                {loadingMore ? "Loading more…" : "Show more results"}
              </button>
            )}

            <p className="m-0 text-xs text-tertiary">
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
                className="font-body font-medium
                  text-sm text-primary truncate"
              >
                {selected.name}
              </span>
              <span className="text-xs text-tertiary truncate">
                {selected.setName} · #{selected.number}
              </span>
            </div>
            {/* Still a plain <button> wearing their recipe, and the one place
                left in this file that is. The focus management above needs a
                ref on the real element, and the vendored Button is typed as a
                plain call signature — its props carry no `ref`, so there is no
                way to reach the node without patching vendored code, which
                the vendored exemption keeps for crashes rather than convenience. */}
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
              <p className="m-0 text-sm text-primary">{selected?.rarity ?? "Unknown"}</p>
            </div>

            <div className="flex flex-col gap-2 min-w-0 m-0 p-0">
              <span className={cardAddLabelClassName}>Type</span>
              <p className="m-0 text-sm text-primary">
                {selected?.types.length ? selected.types.join(", ") : "Unknown"}
              </p>
            </div>

            <div className="flex flex-col gap-2 min-w-0 m-0 p-0">
              <span className={cardAddLabelClassName}>Generation</span>
              <p className="m-0 text-sm text-primary">{draft.gen || "Unknown"}</p>
            </div>

            <Checkbox
              isSelected={draft.collection}
              onChange={(v) => set("collection", v)}
              className="col-span-full cursor-pointer text-primary"
              label="In the binder"
              hint="Off means it is wanted rather than held."
            />

            <Checkbox
              isSelected={draft.excluded}
              onChange={(v) => set("excluded", v)}
              className="col-span-full cursor-pointer text-primary"
              label="Excluded"
              hint="Keeps it out of the latest pull on the about page."
            />

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
              className="col-span-full min-h-5 m-0 font-body
                text-xs text-secondary"
              role="status"
            >
              {error ? (
                <span className="text-primary font-semibold">{error}</span>
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

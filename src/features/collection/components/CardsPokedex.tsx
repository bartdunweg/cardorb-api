"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "@untitledui-pro/icons/line";
import type { DexEntry } from "@/lib/core/pokedex";
import type { DexOwned } from "@/features/collection/components/cards-fields";
import { normalise } from "@/lib/core/pokedex";

/**
 * The collection as a Pokédex: all 1,025 of them, and which ones the binder can
 * show you.
 *
 * The empty slots are the point. Every other view on this route answers "what is
 * in here"; this one answers "what is not", which is the question a collection
 * is actually built around. So nothing is hidden and nothing is collapsed: the
 * gaps are drawn at the same size as the hits, in the order everyone already
 * knows them in.
 *
 * A slot that holds something is a button, and pressing it takes you to those
 * cards. A slot that does not is not a control: there is nothing on the other
 * side of it, and a button that does nothing is worse than a number.
 */
export default function CardsPokedex({
  entries,
  query,
  owned,
  onPick,
}: {
  entries: DexEntry[];
  /** The toolbar's search, which narrows this list by name like any other. */
  query: string;
  /** Every slot, or one of the three states a slot can be in. */
  owned: DexOwned;
  /** Show me the cards of this Pokémon. */
  onPick: (name: string) => void;
}) {
  const shown = useMemo(() => {
    const q = normalise(query.trim());
    return entries.filter((e) => {
      // Owned and wishlist are not opposites and are deliberately allowed to
      // overlap: a Pokémon can be in the binder in one printing and wanted in
      // another, and that Pokémon is a true answer to both questions.
      if (owned === "owned" && !e.owned) return false;
      if (owned === "wishlist" && !e.cards.some((c) => !c.owned)) return false;
      // Not owned is the gaps: no card of it at all, wanted or held.
      if (owned === "missing" && e.cards.length) return false;
      if (!q) return true;
      // The number, too: "#25" and "25" are how half of a dex is searched.
      return normalise(e.name).includes(q) || String(e.id) === q;
    });
  }, [entries, query, owned]);

  if (!shown.length) {
    return (
      <p className="m-0 font-body text-sm text-secondary">
        {owned === "missing"
          ? "Nothing missing in there. Every one of them is in the binder."
          : owned === "owned"
            ? "None of those are in the binder yet."
            : owned === "wishlist"
              ? "None of those are on the wishlist."
              : "No Pokémon by that name. Try a number, or part of one."}
      </p>
    );
  }

  return (
    <ol
      className="list-none m-0 p-0 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(132px,1fr))]
        @max-[560px]:gap-2 @max-[560px]:[grid-template-columns:repeat(auto-fill,minmax(104px,1fr))]"
      role="list"
    >
      {shown.map((entry) => (
        <Slot key={entry.id} entry={entry} onPick={onPick} />
      ))}
    </ol>
  );
}

/**
 * One species: its best scan, or the Pokémon itself where there is no card.
 *
 * The arrows are why this holds state. A Pokémon with eleven cards in the
 * binder showed the first one and said "11", which is a number you cannot look
 * at; now the slot pages through them in place. They stay out of the way until
 * the slot is pointed at, and they sit beside the button rather than inside it,
 * because a button inside a button is not a thing a browser will render.
 */
function Slot({ entry, onPick }: { entry: DexEntry; onPick: (name: string) => void }) {
  const [at, setAt] = useState(0);
  const many = entry.cards.length > 1;
  const card = entry.cards[at] ?? entry.cards[0];
  // Wraps, in both directions: eleven cards behind a 24px arrow is not a list
  // anyone wants to walk to the end of and find a dead control.
  const step = (by: number) => setAt((i) => (i + by + entry.cards.length) % entry.cards.length);

  const empty = entry.cards.length === 0;

  const art = (
    <span
      className={
        "relative flex items-center justify-center aspect-[245/342] mb-2" +
        (empty ? " rounded-orb-xs border border-dashed border-secondary" : "")
      }
    >
      {card?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="w-full h-full object-contain rounded-orb-xs"
          src={card.image}
          alt=""
          loading="lazy"
          decoding="async"
          width={card.imageSize?.width}
          height={card.imageSize?.height}
        />
      ) : (
        // The Pokémon itself, for the ones there is no card of. A dashed
        // rectangle says "nothing here"; this says which nothing, which is the
        // question a dex is read with.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="w-16 h-16 object-contain opacity-50"
          src={`/artwork/pokedex/${entry.id}.png`}
          alt=""
          loading="lazy"
          decoding="async"
          // Every one of the 1025 files scripts/pokedex-art.mjs writes is
          // exactly this, so it is stated rather than looked up: these are not
          // in the artwork manifest, and a dex of a thousand unsized squares
          // reflowed the whole grid as it filled in.
          width={120}
          height={120}
          // A species whose artwork never arrived keeps its slot and its name
          // rather than showing a broken picture.
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      {many && (
        <span
          className="absolute right-[2px] bottom-[2px] min-w-[18px] h-[18px] px-[5px] inline-flex
            items-center justify-center rounded-pill bg-brand-solid text-white
            font-body text-xs lining-nums tabular-nums"
        >
          {at + 1}/{entry.cards.length}
          <span className="sr-only"> cards</span>
        </span>
      )}
    </span>
  );

  const body = (
    <>
      {art}
      <span
        className="font-body text-xs
          lining-nums tabular-nums text-tertiary"
      >
        #{String(entry.id).padStart(4, "0")}
      </span>
      <span
        className={
          "font-body font-medium text-xs" +
          " overflow-hidden text-ellipsis whitespace-nowrap " +
          (empty ? "text-tertiary" : "text-primary")
        }
      >
        {entry.name}
      </span>
    </>
  );

  // Two shapes deep on purpose, matching cards.css's old .cards-dex-art img
  // vs .cards-dex-art .cards-dex-ghost: a bare `img` selector previously beat
  // a single class, so the two images needed different rules to not collide.
  // Tailwind classes on each `<img>` directly avoid that trap entirely.
  const baseBodyClassName =
    "flex flex-col w-full p-2 border-0 rounded-orb-md bg-transparent text-left [color:inherit] [font:inherit]" +
    " relative [--pill-radius:var(--radius-orb-md)]";
  // The hover pill and its cursor are button-only in cards.css
  // (`button.cards-dex-body`) — the empty-slot span never got either, since
  // it isn't a control.
  const buttonBodyClassName =
    baseBodyClassName +
    " cursor-pointer [&>*]:relative [&>*]:z-1" +
    " after:content-[''] after:absolute after:inset-0 after:z-0 after:rounded-orb-md" +
    " after:bg-primary after:border after:border-secondary after:shadow-xs" +
    " after:opacity-0 after:scale-[0.98] after:pointer-events-none" +
    " after:transition-[opacity,transform] after:duration-[150ms] after:ease-out" +
    " hover:after:opacity-100 hover:after:scale-100" +
    " focus-visible:after:opacity-100 focus-visible:after:scale-100";

  return (
    <li className="group relative min-w-0">
      {entry.cards.length ? (
        <button
          type="button"
          className={buttonBodyClassName}
          onClick={() => onPick(entry.name)}
          aria-label={`${entry.name}, ${entry.cards.length} ${
            entry.cards.length === 1 ? "card" : "cards"
          } in the collection`}
        >
          {body}
        </button>
      ) : (
        <span className={baseBodyClassName}>{body}</span>
      )}

      {many && (
        <>
          <button
            type="button"
            className={`${cardsDexStepClassName} left-0`}
            onClick={() => step(-1)}
            aria-label={`Previous card of ${entry.name}`}
          >
            <ChevronLeft size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${cardsDexStepClassName} right-0`}
            onClick={() => step(1)}
            aria-label={`Next card of ${entry.name}`}
          >
            <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </>
      )}
    </li>
  );
}

const cardsDexStepClassName =
  "absolute top-[calc(calc(var(--spacing)*2)+33%)] flex items-center justify-center w-6 h-6 p-0" +
  " border border-secondary rounded-full bg-primary text-secondary" +
  " cursor-pointer opacity-0 transition-opacity duration-[150ms] ease-out z-2" +
  " group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" +
  " hover:text-primary hover:border-primary";

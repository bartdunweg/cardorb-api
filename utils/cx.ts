import { extendTailwindMerge } from "tailwind-merge";
import { radiusNames } from "@/lib/design/theme-values";

/**
 * ── Why the radius scale has to be listed here ─────────────────────────────
 *
 * tailwind-merge does not read the stylesheet. It knows Tailwind's own scale by
 * heart and treats anything else as a class it has never heard of — and a class
 * it has never heard of belongs to no group, so it is never the thing that
 * replaces another class. `cx("rounded-lg", "rounded-orb-sm")` returned **both**,
 * and which one the element actually wore was decided by whichever rule
 * Tailwind happened to emit later.
 *
 * That was already true before the shape tokens existed, and already live:
 * `SigninShell`'s wide button and `ViewOptions`' segments both pass a
 * `rounded-orb-*` through `className` expecting it to win. It went unnoticed
 * because 8px and 8px look identical whichever way the tie fell.
 *
 * It stops being invisible the moment the base radius is a capsule and the
 * override is 8px. So the names are declared, and declared **from the token
 * module** rather than typed out — a hand-written list is one that silently
 * stops covering the scale the first time somebody adds to it, which is this
 * same bug again one rung up.
 */
const twMerge = extendTailwindMerge({
    extend: {
        theme: {
            text: ["display-xs", "display-sm", "display-md", "display-lg", "display-xl", "display-2xl"],
            radius: [...radiusNames],
        },
    },
});

/**
 * This function is a wrapper around the twMerge function.
 * It is used to merge the classes inside style objects.
 */
export const cx = twMerge;

/**
 * This function does nothing besides helping us to be able to
 * sort the classes inside style objects which is not supported
 * by the Tailwind IntelliSense by default.
 */
export function sortCx<T extends Record<string, string | number | Record<string, string | number | Record<string, string | number>>>>(classes: T): T {
    return classes;
}

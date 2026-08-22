import next from "eslint-config-next";

// eslint-config-next exports the flat config as an array, not as a factory, so
// `...next()` threw "next is not a function" and `npm run check` had never got
// past typecheck and tests. Named rather than exported anonymously, which is
// its own rule in this config.

/**
 * The one import this project keeps on a short leash.
 *
 * `unstable_cache` is what holds the collection and the catalogue together
 * while cacheComponents is off, and Next's own documentation says in the same
 * breath that it is "replaced by `use cache` in Next.js 16". So it is the right
 * answer today and a migration tomorrow, and the size of that migration is
 * decided entirely by how many files reached for it in the meantime.
 *
 * Two files may. Everything else that wants a cache should ask one of them for
 * the data rather than caching its own copy, which is also the honest design:
 * a cache in a component is a cache nobody can invalidate.
 *
 * revalidateTag and revalidatePath are deliberately *not* restricted — those
 * are how a write says the cache is wrong, and they belong at the write.
 */
const CACHE_OWNERS = ["src/lib/core/catalogue.ts", "src/lib/core/collection.ts"];

const cacheLeash = {
  files: ["**/*.ts", "**/*.tsx"],
  ignores: CACHE_OWNERS,
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "next/cache",
            importNames: ["unstable_cache"],
            message:
              "unstable_cache lives in src/lib/core/catalogue.ts and src/lib/core/collection.ts only, so the move to `use cache` stays a two-file change. Ask those modules for the data instead.",
          },
        ],
      },
    ],
  },
};

const config = [
  {
    // .claude/** is not a slip: Claude's worktrees live inside the checkout,
    // each a full copy of this repo including its .next/. Linting them means
    // linting a two-day-old copy of the project and reporting its build output
    // as this project's errors.
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", ".claude/**", ".context/**"],
  },
  ...next,
  cacheLeash,
  {
    /**
     * Untitled UI's vendored components, exempt.
     *
     * `components/`, `src/utils/` and `src/hooks/` are written by `npx untitledui add`,
     * not by anybody here, and re-written wholesale on the next update. Holding
     * them to this project's rules means either editing every file after every
     * add — and `scripts/untitled-add.mjs` already re-applies three such
     * patches — or turning a rule off for the whole repository because a
     * dependency trips it.
     *
     * Neither is right. The rules exist to keep *authored* code honest, and
     * `app/` and `lib/` are where the authoring happens. What the exemption
     * covers is real and worth knowing: `use-breakpoint.ts` calls setState in an
     * effect body, and four components use <img> where this project uses
     * next/image. Both are defensible in a library that cannot assume Next.
     *
     * The same argument, in the same shape, is why `@ts-nocheck` goes on top of
     * these files — TypeScript has no per-directory options, so that one has to
     * be a patch. ADR-0061 has both.
     */
    /* src/hooks/ is named file by file rather than as a directory, because it
       is the one mixed tree: Untitled UI's use-breakpoint.ts sits beside three
       hooks this project wrote, and those three must be linted. A directory
       glob here would exempt them silently — the worst kind of exemption,
       because nothing reports a rule that stopped running.

       If `npm run ui:add` writes another hook, add it to this list. The
       wrapper prints what it changed, which is where you will see it. */
    ignores: ["src/components/**", "src/utils/**", "src/hooks/use-breakpoint.ts"],
  },
];

export default config;

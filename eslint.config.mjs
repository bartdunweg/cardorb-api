import { readdirSync } from "node:fs";
import next from "eslint-config-next";

/**
 * R-STRUCT-001 and R-STRUCT-002, generated from the directory rather than typed
 * out per pair.
 *
 * This used to be two hand-written blocks, one per feature, each naming the
 * other. Both rules read `Enforced` in CONVENTIONS.md and both were — for
 * exactly the two directory names somebody had remembered to write down. A third
 * feature was guarded by nothing at all, and the sign-off check proved it: a file
 * under `src/features/pricing/` importing both another feature *and* a route
 * linted clean.
 *
 * A single blanket block cannot express this, because a feature's own files
 * import each other through the same `@/features/<name>/…` alias — 35 times in
 * `collection` alone. So it stays one block per feature, and the list comes from
 * the filesystem so the next feature is guarded the day the directory exists.
 *
 * Read at config load, relative to the working directory, which is the repo root
 * whenever ESLint runs here. The same bet src/lib/design/type-discipline.test.ts
 * makes about its own roots.
 */
const FEATURES = readdirSync("src/features", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const CROSS_FEATURE =
  "A feature may not import another feature. Put the cross-link in the route that needs both, or lift it into lib/.";
const FEATURE_TO_ROUTE =
  "A feature may not import a route. Routes compose features, never the reverse — move what you need into this feature.";

const featureBoundaries = FEATURES.map((name) => ({
  files: [`src/features/${name}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          ...FEATURES.filter((other) => other !== name).map((other) => ({
            group: [`@/features/${other}/*`, `@/features/${other}`],
            message: CROSS_FEATURE,
          })),
          { group: ["@/app/*", "@/app"], message: FEATURE_TO_ROUTE },
        ],
      },
    ],
  },
}));

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
     * `components/` and the named files in `src/utils/` and `src/hooks/` are
     * written by `npx untitledui add`, not by anybody here, and re-written
     * wholesale on the next update. Holding
     * them to this project's rules means either editing every file after every
     * add — and `scripts/untitled-add.mjs` already re-applies three such
     * patches — or turning a rule off for the whole repository because a
     * dependency trips it.
     *
     * Neither is right. The rules exist to keep *authored* code honest, and
     * `app/` and `lib/` are where the authoring happens. What the exemption
     * covers is real and worth knowing: four components use <img> where this
     * project uses next/image, which is defensible in a library that cannot
     * assume Next. The other example here used to be `use-breakpoint.ts` calling
     * setState in an effect body; that file was deleted in c38dacf and the
     * sentence outlived it by a week.
     *
     * The same argument, in the same shape, is why `@ts-nocheck` goes on top of
     * these files — TypeScript has no per-directory options, so that one has to
     * be a patch. ADR-0061 has both.
     */
    /* src/hooks/ and src/utils/ are named file by file rather than as
       directories, because they are the two mixed trees: Untitled UI's
       use-resize-observer.ts sits beside three hooks this project wrote, and
       is-react-component.ts beside cx.ts, which is ours. A directory glob here
       would exempt those silently — the worst kind of exemption, because
       nothing reports a rule that stopped running. src/utils/** *was* such a
       glob until it was noticed; use-breakpoint.ts was listed here for a while
       after it had been deleted, which is the same failure one step on.

       If `npm run ui:add` writes another hook, add it to this list. The
       wrapper prints what it changed, which is where you will see it. */
    /* The four vendored trees by name, not `src/components/**`.
       That wider glob is what this ignore used to be — as `components/**` — and
       it swallowed components/custom/ with it: 65 files of this project's own
       code, exempt from eslint since the day Untitled UI was vendored, and
       nothing ever said so. Phase 4 renamed that directory to shared/ and the
       exemption followed it silently, which is how it was finally noticed. */
    ignores: [
      "src/components/base/**",
      "src/components/application/**",
      "src/components/foundations/**",
      "src/components/shared-assets/**",
      "src/utils/is-react-component.ts",
      "src/hooks/use-resize-observer.ts",
    ],
  },
  /**
   * ── The one rule that keeps features/ from becoming shared/ again ─────────
   *
   * Three edges, all of them the same mistake in different clothes:
   *
   *   1. A feature importing another feature. Two domains that reach into each
   *      other are one domain with a folder between them, and the folder is the
   *      part that lies. Cross-links belong in the route that needs both, or in
   *      lib/ if they are genuinely shared.
   *   2. A feature importing a route. Routes compose features, never the
   *      reverse. This one was real: CollectionScreen imported
   *      app/(app)/CollectionContext until ADR — see Phase 4 — moved the context
   *      into the domain it belongs to.
   *   3. components/shared/ importing a feature. Shared code that knows about a
   *      domain is not shared; it is that domain's code in the wrong drawer,
   *      and it is how the 48-file shared/ happened in the first place.
   *
   * `no-restricted-imports` is ESLint's own rule, so this needs no plugin.
   * eslint-plugin-boundaries would express it more directly and is not worth a
   * dependency for three patterns.
   *
   * The split these guard was measured before it was made: zero
   * collection <-> account edges existed. This is what keeps that true.
   */
  ...featureBoundaries,
  {
    files: ["src/components/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*", "@/features"],
              message:
                "components/shared/ may not know about a feature. If it needs one, it is that feature's component and belongs under src/features/.",
            },
          ],
        },
      ],
    },
  },
];

export default config;

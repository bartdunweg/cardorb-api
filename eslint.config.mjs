import next from "eslint-config-next";

// eslint-config-next exports the flat config as an array, not as a factory, so
// `...next()` threw "next is not a function" and `npm run check` had never got
// past typecheck and tests. Named rather than exported anonymously, which is
// its own rule in this config.

/**
 * ── The cache leash ──────────────────────────────────────────────────────────
 *
 * `unstable_cache` is imported in exactly two modules, so the move to `use
 * cache` stays a two-file change. Everything else asks those modules for the
 * data. `no-restricted-imports` is ESLint's own rule, so this needs no plugin.
 */
const CACHE_OWNERS = [
  "src/lib/core/catalogue/catalogue.ts",
  "src/lib/core/collection/collection.ts",
];

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
              "unstable_cache lives in src/lib/core/catalogue/catalogue.ts and src/lib/core/collection/collection.ts only, so the move to `use cache` stays a two-file change. Ask those modules for the data instead.",
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
];

export default config;

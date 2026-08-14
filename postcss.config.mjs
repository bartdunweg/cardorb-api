/**
 * Tailwind, and nothing else.
 *
 * Next runs its own Lightning CSS pass after this, which is what downlevels
 * light-dark() for browsers that lack it — so nothing here needs to think about
 * prefixing or nesting.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;

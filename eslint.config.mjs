import next from "eslint-config-next";

// eslint-config-next exports the flat config as an array, not as a factory, so
// `...next()` threw "next is not a function" and `npm run check` had never got
// past typecheck and tests. Named rather than exported anonymously, which is
// its own rule in this config.
const config = [{ ignores: [".next/**", "node_modules/**", "next-env.d.ts"] }, ...next];

export default config;

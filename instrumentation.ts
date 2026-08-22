import { checkEnv } from "./src/lib/core/env";

/**
 * Once per server, before the first request.
 *
 * The only place the environment can be checked in one go. A module-level check
 * would run wherever the module is imported, which includes proxy.ts — once per
 * matched request, in a bundle at the network boundary, to answer a question
 * about the server that only changes when the server restarts. It used to be
 * worse than noisy: proxy.ts was middleware.ts on the edge runtime, which does
 * not have most of these variables at all, so the check would have reported
 * them missing on a deployment where they were set.
 */
export function register() {
  checkEnv();
}

/**
 * The other half of the reference number on the error page.
 *
 * Next replaces a production error's message with a digest so a stack trace
 * never reaches a public page, and RouteError shows that digest to the visitor
 * so they can quote it. Until now nothing wrote the matching side: the number
 * was on screen and in no log, so quoting it identified nothing.
 *
 * onRequestError is the hook that closes that loop. It runs on the server for
 * every error a route throws, and it is the only place where the digest and the
 * real error exist at the same moment.
 *
 * console.error rather than a reporting service, deliberately. There is no
 * Sentry here and adding one is a decision about somebody else's servers
 * holding this app's failures; Vercel already keeps function logs, and a
 * greppable line in them is the whole distance between "it broke" and the
 * request that broke. If a service is ever added, this is the one function it
 * has to be wired into.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : "none";

  // One line and one shape, so it can be grepped by digest. The message and the
  // stack go with it: this is a server log, and the reason the digest exists is
  // that these two must not travel to the browser.
  console.error(
    JSON.stringify({
      at: "request-error",
      digest,
      method: request.method,
      path: request.path,
      route: context.routePath,
      routeType: context.routeType,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
}

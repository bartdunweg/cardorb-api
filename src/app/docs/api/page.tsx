import type { Metadata } from "next";
import MarketingFooter from "@/components/shared/MarketingFooter";
import Navbar from "@/components/shared/Navbar";
import { legal } from "@/components/shared/LegalPage";
import { APP_NAME } from "@/lib/core/config";
import { readSpec, sections } from "./_components/reference";

/**
 * The API reference, rendered from the contract.
 *
 * `public/openapi.yaml` is read at build time and drawn as plain HTML: no
 * Swagger UI, no Redoc, no script from anywhere. The content security policy
 * allows scripts from this origin only, and a reference for two clients we
 * wrote ourselves does not need a try-it-out console. It needs to be true,
 * which src/app/api/openapi.test.ts sees to, and readable, which is this.
 *
 * On api.cardorb.com this page is `/` — see next.config.ts. Here it stays at
 * /docs/api, and the raw contract is beside it at /openapi.yaml.
 */

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "API",
  description: `Every route ${APP_NAME} answers, what it needs, and what it says back.`,
  alternates: { canonical: "/docs/api" },
};

const { h2, h3, body, link, strong } = legal;

/** The type for a method or a status: monospace, one step below body. */
const code = "font-mono text-sm text-primary";

export default function ApiReferencePage() {
  const spec = readSpec();
  const groups = sections(spec);

  return (
    <div className="-mt-[var(--main-pad-top)]">
      <Navbar />

      <main
        id="main-content"
        className="w-[min(100%,1180px)] mx-auto [padding:0_var(--page-pad-x)_var(--page-pad-bottom)]"
      >
        <article className="max-w-[var(--content-max)] mx-auto [padding-block:clamp(56px,8vw,96px)]">
          <h1
            className="mt-0 mb-3 text-primary font-body font-title
              tracking-display leading-tight text-display-md"
          >
            {spec.info.title}
          </h1>
          <p className="m-0 text-tertiary font-body text-xs">
            Version {spec.info.version} ·{" "}
            <a className={link} href="/openapi.yaml">
              openapi.yaml
            </a>
          </p>

          {spec.info.description && (
            <div className="mt-6">
              {spec.info.description
                .trim()
                .split(/\n\s*\n/)
                .map((paragraph) => (
                  <p key={paragraph} className={body}>
                    {paragraph}
                  </p>
                ))}
            </div>
          )}

          <h2 className={h2}>Servers</h2>
          <ul className={`${body} list-disc ps-6 [&>li]:mb-2 [&>li:last-child]:mb-0`}>
            {(spec.servers ?? []).map((server) => (
              <li key={server.url}>
                <span className={code}>{server.url}</span>
                {server.description && <> — {server.description}</>}
              </li>
            ))}
          </ul>

          {groups.map((group) => (
            <section key={group.tag}>
              <h2 className={h2}>{group.tag}</h2>
              {group.description && <p className={body}>{group.description}</p>}

              {group.operations.map((op) => (
                <div key={`${op.method} ${op.path}`} className="mt-7">
                  <h3 className={`${h3} mt-0`}>
                    <span className={code}>{op.method}</span>{" "}
                    <span className={code}>{op.path}</span>
                    {op.deprecated && (
                      <span className="ms-2 text-tertiary text-xs">deprecated</span>
                    )}
                  </h3>
                  <p className={body}>
                    <span className={strong}>{op.summary}</span>
                    {" · "}
                    {op.auth}
                  </p>
                  {op.description && <p className={body}>{op.description}</p>}

                  {op.parameters.length > 0 && (
                    <ul className={`${body} list-disc ps-6 [&>li]:mb-1 [&>li:last-child]:mb-0`}>
                      {op.parameters.map((p) => (
                        <li key={`${p.where}:${p.name}`}>
                          <span className={code}>{p.name}</span>
                          <span className="text-tertiary text-xs">
                            {" "}
                            {p.where}
                            {p.required ? ", required" : ""}
                          </span>
                          {p.description && <> — {p.description}</>}
                        </li>
                      ))}
                    </ul>
                  )}

                  <ul className={`${body} list-none ps-0 [&>li]:mb-1 [&>li:last-child]:mb-0`}>
                    {op.responses.map((r) => (
                      <li key={r.status}>
                        <span className={code}>{r.status}</span> {r.description}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </article>

        <MarketingFooter />
      </main>
    </div>
  );
}

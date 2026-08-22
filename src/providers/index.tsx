"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/shared/ThemeProvider";

/**
 * Every React context the app is wrapped in, in one place.
 *
 * There is one today, and that is not an argument against the file — it is the
 * reason for it. `app/layout.tsx` named `ThemeProvider` directly, so adding a
 * second provider meant editing the root layout: a 180-line file whose real
 * subject is the <html> element, the blocking theme script that has to run
 * before paint, and a skip link with a paragraph explaining where the <main>
 * landmark went. A provider added there lands in the middle of that and has to
 * be read past by everyone who comes for something else.
 *
 * Order matters as soon as there are two, and this is where it will be
 * legible. Note what does *not* belong here: <Analytics /> is not a provider,
 * it renders nothing and wraps nothing, and it stays at the end of <body>
 * where its own comment about the CSP can sit beside it.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

import { beforeEach } from "vitest";
import { resetBreaker } from "./src/lib/core/catalogue/tcgdex-client";

// A test that plays a TCGdex outage opens the breaker for twenty seconds; the next test in the
// file must not inherit that. See tcgdex-client.ts.
beforeEach(() => resetBreaker());

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Billing buttons stay disabled from the click until the browser leaves for Stripe.
// Back from Stripe can restore the page from the back/forward cache with that state
// intact, so each flag must come from useRedirectPending, which clears it on restore.
// (Vitest has no DOM to click through; tests/unit/hooks/useRedirectPending.test.ts
// covers the reset itself.)

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");

describe.each([
  ["src/components/account/BillingSection.tsx", ["isStartingCheckout", "isOpeningPortal"]],
  ["src/pages/Pricing.tsx", ["isStartingCheckout"]],
])("%s", (file, flags) => {
  const source = read(file);

  it.each(flags)("takes %s from useRedirectPending", (flag) => {
    expect(source).toMatch(new RegExp(String.raw`\[\s*${flag}\s*,\s*\w+\s*\]\s*=\s*useRedirectPending\(\)`));
    expect(source).not.toMatch(new RegExp(String.raw`\[\s*${flag}\s*,\s*\w+\s*\]\s*=\s*useState`));
  });

  it("refetches billing status when the page is restored", () => {
    expect(source).toMatch(/usePageRestoredFromCache\(/);
  });
});

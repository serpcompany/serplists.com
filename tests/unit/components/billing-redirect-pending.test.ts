import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Billing buttons stay disabled from the click until the browser leaves for Stripe.
// Back from Stripe can restore the page from the back/forward cache with that state
// intact, so each flag must come from useRedirectPending, which clears it on restore.
// (Vitest has no DOM to click through; tests/unit/hooks/useRedirectPending.test.ts
// covers the reset itself.) The files are found by scanning src/, so a new checkout
// entry point cannot be missed.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");

const listSourceFiles = (dir: string): string[] =>
  readdirSync(path.join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return listSourceFiles(relative);
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });

// A call that can send the browser to Stripe Checkout or the Customer Portal.
const REDIRECT_CALL =
  /\b(?:startBillingCheckout|handleUpgradeRequiredForContext|createBillingCheckout|createBillingPortal)\s*\(/;
// A pending flag that stays set while the browser leaves.
const REDIRECT_FLAG = /^is\w*(?:Checkout|Portal|Redirect)\w*$/;
const STATE_PAIR = /\[\s*(\w+)\s*,\s*\w+\s*\]\s*=\s*(\w+)\s*(?:<[^>]*>)?\s*\(/g;

const redirectFlags = listSourceFiles("src").flatMap((file) => {
  const source = read(file);
  if (!REDIRECT_CALL.test(source)) return [];
  return Array.from(source.matchAll(STATE_PAIR))
    .filter(([, flag]) => REDIRECT_FLAG.test(flag))
    .map(([, flag, hook]) => ({ file, flag, hook }));
});

describe("pending flags that carry a billing redirect", () => {
  it("finds every known checkout and portal entry point", () => {
    const found = redirectFlags.map(({ file, flag }) => `${file}:${flag}`);
    expect(found).toEqual(
      expect.arrayContaining([
        "src/components/account/BillingSection.tsx:isStartingCheckout",
        "src/components/account/BillingSection.tsx:isOpeningPortal",
        "src/pages/Pricing.tsx:isStartingCheckout",
        "src/pages/Templates.tsx:isStartingCheckout",
        "src/features/template-editor/useTemplateEditorAccess.ts:isStartingCheckout",
      ]),
    );
  });

  it.each(redirectFlags.map(({ file, flag, hook }) => [`${file} ${flag}`, hook]))(
    "%s comes from useRedirectPending",
    (_label, hook) => {
      expect(hook).toBe("useRedirectPending");
    },
  );
});

// The plan may have changed at Stripe (or in another tab) before the user pressed Back.
describe.each([
  "src/components/account/BillingSection.tsx",
  "src/pages/Pricing.tsx",
  "src/features/template-editor/useTemplateEditorAccess.ts",
])("%s", (file) => {
  it("refetches billing status when the page is restored", () => {
    expect(read(file)).toMatch(
      /usePageRestoredFromCache\([\s\S]*?invalidateQueries\(\{\s*queryKey:\s*BILLING_STATUS_QUERY_PREFIX/,
    );
  });
});

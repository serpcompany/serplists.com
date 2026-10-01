import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");

const listSourceFiles = (dir: string): string[] =>
  readdirSync(path.join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return listSourceFiles(relative);
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });

const STRIPE_REDIRECT_CALL =
  /\b(?:startBillingCheckout|handleUpgradeRequiredForContext|createBillingCheckout|createBillingPortal|createBillingPortalUrl|createPersonalCheckoutUrl)\s*\(/;
const REDIRECT_PENDING_FLAG_NAME = /^is\w*(?:Checkout|Portal|Redirect)\w*$/;
const STATE_PAIR = /\[\s*(\w+)\s*,\s*\w+\s*\]\s*=\s*(\w+)\s*(?:<[^>]*>)?\s*\(/g;

const redirectFlags = listSourceFiles("src").flatMap((file) => {
  const source = read(file);
  if (!STRIPE_REDIRECT_CALL.test(source)) return [];
  return Array.from(source.matchAll(STATE_PAIR))
    .filter(([, flag]) => REDIRECT_PENDING_FLAG_NAME.test(flag))
    .map(([, flag, hook]) => ({ file, flag, hook }));
});

describe("pending flags that carry a billing redirect, found by scanning src/ so a new checkout entry point cannot be missed", () => {
  it("finds every known checkout and portal entry point", () => {
    const found = redirectFlags.map(({ file, flag }) => `${file}:${flag}`);
    expect(found).toEqual(
      expect.arrayContaining([
        "src/components/account/BillingSection.tsx:isStartingCheckout",
        "src/components/account/BillingSection.tsx:isOpeningPortal",
        "src/views/Pricing.tsx:isStartingCheckout",
        "src/views/Templates.tsx:isStartingCheckout",
        "src/features/template-editor/useTemplateEditorAccess.ts:isStartingCheckout",
      ]),
    );
  });

  it.each(redirectFlags.map(({ file, flag, hook }) => [`${file} ${flag}`, hook]))(
    "%s comes from useRedirectPending, which clears it when Back restores the page from the back/forward cache",
    (_label, hook) => {
      expect(hook).toBe("useRedirectPending");
    },
  );
});

describe.each([
  "src/components/account/BillingSection.tsx",
  "src/views/Pricing.tsx",
  "src/features/template-editor/useTemplateEditorAccess.ts",
])("%s", (file) => {
  it("refetches billing status when the page is restored, since the plan may have changed at Stripe or in another tab", () => {
    expect(read(file)).toMatch(
      /usePageRestoredFromCache\([\s\S]*?invalidateQueries\(\{\s*queryKey:\s*BILLING_STATUS_QUERY_PREFIX/,
    );
  });
});

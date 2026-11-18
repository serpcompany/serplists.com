import { describe, expect, it } from "vitest";

import { runStripeScript } from "../../support/stripeApiStandIn";

const SCRIPT = "scripts/stripe/scrub-local-live.ts";

describe("pnpm run stripe:local:scrub-live (scripts/stripe/scrub-local-live.ts)", () => {
  it("removes a live key with the ids and secrets that belong to it, every *_LIVE name, and the production-only names", async () => {
    const run = await runStripeScript(SCRIPT, {
      devVars: [
        "# Local values",
        "BETTER_AUTH_SECRET=kept",
        "STRIPE_SECRET_KEY=sk_live_copied_from_production",
        "STRIPE_PRO_PRICE_ID=price_live",
        "STRIPE_PRO_LEGACY_PRICE_IDS=price_old",
        "STRIPE_WEBHOOK_SECRET=whsec_live",
        "STRIPE_PORTAL_CONFIGURATION_ID=bpc_live",
        "STRIPE_SECRET_KEY_LIVE=sk_live_second_copy",
        "STRIPE_ACCOUNT_ID=acct_live",
        "STRIPE_WEBHOOK_URL=https://serplists.com/api/stripe/webhook",
        "",
      ].join("\n"),
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Removed 8 production-only Stripe variable name(s) from .dev.vars.");
    expect(run.devVars).toBe("# Local values\nBETTER_AUTH_SECRET=kept\n");
  });

  it("keeps a test key and its ids, removing only the production-only names", async () => {
    const run = await runStripeScript(SCRIPT, {
      devVars: "STRIPE_SECRET_KEY=sk_test_local\nSTRIPE_PRO_PRICE_ID=price_test\nSTRIPE_ACCOUNT_ID=acct_live\n",
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Removed 2 production-only Stripe variable name(s) from .dev.vars.");
    expect(run.devVars).toBe("STRIPE_SECRET_KEY=sk_test_local\nSTRIPE_PRO_PRICE_ID=price_test\n");
  });
});

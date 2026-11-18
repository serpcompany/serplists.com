import { describe, expect, it } from "vitest";

import { runStripeScript, stripeList, type StripeCall, type StripeRoute } from "../../support/stripeApiStandIn";

const SCRIPT = "scripts/stripe/setup-local-test.ts";
const DEV_VARS = "BETTER_AUTH_SECRET=kept\nSTRIPE_TEST_SECRET_KEY=sk_test_dedicated\nSTRIPE_SECRET_KEY=sk_test_general\n";

const monthlyPrice = (overrides: Record<string, unknown> = {}) => ({
  id: "price_test_monthly",
  active: true,
  type: "recurring",
  product: { id: "prod_pro" },
  unit_amount: 900,
  currency: "usd",
  recurring: { interval: "month", interval_count: 1 },
  ...overrides,
});
const portal = (id: string, metadata: Record<string, string>) => ({ id, active: true, is_default: false, metadata });
const ourPortal = portal("bpc_test", { app: "serp-checklists", purpose: "customer-portal" });

const isPriceLookup = (call: StripeCall) => call.path === "/v1/prices";
const testAccount = ({ prices = [monthlyPrice()], portals = [ourPortal] }: { prices?: unknown[]; portals?: unknown[] } = {}): StripeRoute =>
  (call) => {
    if (isPriceLookup(call)) return stripeList(prices);
    if (call.path === "/v1/billing_portal/configurations") return stripeList(portals);
    return undefined;
  };

describe("pnpm run stripe:local:setup (scripts/stripe/setup-local-test.ts)", () => {
  it("saves the test key, the $9 monthly test price and the test Customer Portal to .dev.vars", async () => {
    const run = await runStripeScript(SCRIPT, {
      devVars: DEV_VARS,
      route: testAccount({ portals: [portal("bpc_other", { app: "another-app" }), ourPortal] }),
    });

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Local Stripe runtime is configured for the $9/month test plan.");
    expect(run.calls.map((call) => call.secretKey)).toEqual(["sk_test_dedicated", "sk_test_dedicated"]);
    expect(run.calls.find(isPriceLookup)?.query.get("lookup_keys[]")).toBe("serp-checklists_pro_monthly");
    expect(run.devVars).toBe(
      "BETTER_AUTH_SECRET=kept\nSTRIPE_TEST_SECRET_KEY=sk_test_dedicated\nSTRIPE_SECRET_KEY=sk_test_dedicated\n"
        + "STRIPE_PRO_PRICE_ID=price_test_monthly\nSTRIPE_PORTAL_CONFIGURATION_ID=bpc_test\n",
    );
  });

  it.each([
    ["a *_LIVE name", "STRIPE_SECRET_KEY_LIVE=sk_live_copy\nSTRIPE_SECRET_KEY=sk_test_general\n"],
    ["a live key under any name", "STRIPE_SECRET_KEY=sk_test_general\nOLD_KEY=sk_live_copy\n"],
  ])("refuses a .dev.vars that holds %s, before calling Stripe", async (_holding, devVars) => {
    const run = await runStripeScript(SCRIPT, { devVars, route: testAccount() });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(".dev.vars must contain local/test values only. Run pnpm run stripe:local:scrub-live first.");
    expect(run.calls).toEqual([]);
    expect(run.devVars).toBe(devVars);
  });

  it("needs a test key", async () => {
    const run = await runStripeScript(SCRIPT, { devVars: "BETTER_AUTH_SECRET=kept\n", route: testAccount() });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Missing Stripe test secret key.");
    expect(run.calls).toEqual([]);
  });

  it.each([
    ["no active price under the lookup key", { prices: [] }, "Expected an active $9 USD monthly test price. Run the Stripe bootstrap first."],
    [
      "a price that no longer matches the plan",
      { prices: [monthlyPrice({ unit_amount: 1200 })] },
      "Test price price_test_monthly has unit_amount 1200 (requested 900).",
    ],
    [
      "no Customer Portal configuration made by the bootstrap",
      { portals: [portal("bpc_other", { app: "serp-checklists", purpose: "something-else" })] },
      "Expected a test Customer Portal configuration. Run the portal bootstrap first.",
    ],
  ])("stops, leaving .dev.vars as it was, when the test account has %s", async (_case, account, refusal) => {
    const run = await runStripeScript(SCRIPT, { devVars: DEV_VARS, route: testAccount(account) });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(refusal);
    expect(run.devVars).toBe(DEV_VARS);
  });
});

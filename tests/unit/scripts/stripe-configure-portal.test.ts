import { describe, expect, it } from "vitest";

import { runStripeScript, stripeList, type StripeCall } from "../../support/stripeApiStandIn";

const SCRIPT = "scripts/stripe/configure-portal.ts";
const TEST_KEY_IN_DEV_VARS = "STRIPE_SECRET_KEY=sk_test_portal\n";

const portal = (id: string, metadata: Record<string, string> | null) => ({ id, active: true, is_default: false, metadata });
const ours = portal("bpc_ours", { app: "serp-checklists", purpose: "customer-portal" });

const isList = (call: StripeCall) => call.method === "GET" && call.path === "/v1/billing_portal/configurations";
const isCreate = (call: StripeCall) => call.method === "POST" && call.path === "/v1/billing_portal/configurations";

describe("pnpm run stripe:portal:configure (scripts/stripe/configure-portal.ts)", () => {
  it("creates the SERP Lists Customer Portal configuration in the test account when there is none", async () => {
    const run = await runStripeScript(SCRIPT, {
      args: ["--test"],
      devVars: TEST_KEY_IN_DEV_VARS,
      route: (call) => {
        if (isList(call)) return stripeList([portal("bpc_other", { app: "another-app" }), portal("bpc_bare", null)]);
        if (isCreate(call)) return { status: 200, body: { ...ours, id: "bpc_created" } };
        return undefined;
      },
    });

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ mode: "test", configurationId: "bpc_created", active: true, isDefault: false });
    expect(run.calls.map((call) => call.secretKey)).toEqual(["sk_test_portal", "sk_test_portal"]);
    expect(run.calls[0]?.query.get("active")).toBe("true");
    const created = run.calls.find(isCreate)?.form;
    expect(created?.get("metadata[app]")).toBe("serp-checklists");
    expect(created?.get("metadata[purpose]")).toBe("customer-portal");
    expect(created?.get("default_return_url")).toBe("https://serplists.com/dashboard/settings/");
    expect(created?.get("features[subscription_cancel][mode]")).toBe("at_period_end");
    expect(created?.getAll("features[customer_update][allowed_updates][]")).toEqual(["name", "email", "address", "tax_id"]);
    expect(created?.getAll("features[subscription_cancel][cancellation_reason][options][]")).toEqual([
      "too_expensive",
      "missing_features",
      "switched_service",
      "unused",
      "other",
    ]);
  });

  it("reuses the configuration it made before instead of creating another", async () => {
    const run = await runStripeScript(SCRIPT, {
      args: ["--test"],
      devVars: TEST_KEY_IN_DEV_VARS,
      route: (call) => (isList(call) ? stripeList([portal("bpc_other", { app: "another-app" }), ours]) : undefined),
    });

    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ mode: "test", configurationId: "bpc_ours" });
    expect(run.calls.filter(isCreate)).toEqual([]);
  });

  it("stops with Stripe's message when Stripe refuses the key", async () => {
    const run = await runStripeScript(SCRIPT, {
      args: ["--test"],
      devVars: TEST_KEY_IN_DEV_VARS,
      route: () => ({ status: 401, body: { error: { message: "Invalid API Key provided" } } }),
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Stripe API error (401): Invalid API Key provided");
  });

  it("needs a test key for --test", async () => {
    const run = await runStripeScript(SCRIPT, { args: ["--test"], devVars: "BETTER_AUTH_SECRET=x\n" });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Missing Stripe test secret key in the local environment.");
    expect(run.calls).toEqual([]);
  });

  it("takes the live key only from the process environment, never from .dev.vars", async () => {
    const run = await runStripeScript(SCRIPT, { devVars: "STRIPE_SECRET_KEY=sk_live_written_in_a_file\n" });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Live mode requires STRIPE_LIVE_SECRET_KEY injected through the process environment.");
    expect(run.calls).toEqual([]);
  });
});

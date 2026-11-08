import { describe, expect, it } from "vitest";

import { objectContaining } from "../../support/asymmetricMatchers";
import { runStripeScript, stripeList, type StripeAnswer, type StripeCall } from "../../support/stripeApiStandIn";

const SCRIPT = "scripts/stripe/bootstrap.ts";
const TEST_KEY = "STRIPE_SECRET_KEY=sk_test_bootstrap\n";
const PRO_METADATA = { app: "serp-checklists", tier: "pro" };

const product = (id: string, metadata: Record<string, string> | null = PRO_METADATA) => ({ id, metadata });
const price = (id: string, interval: string, overrides: Record<string, unknown> = {}) => ({
  id,
  active: true,
  type: "recurring",
  product: "prod_pro",
  unit_amount: 900,
  currency: "usd",
  recurring: { interval, interval_count: 1 },
  ...overrides,
});

const at = (method: string, path: string) => (call: StripeCall) => call.method === method && call.path === path;
const searchProducts = at("GET", "/v1/products/search");
const listProducts = at("GET", "/v1/products");
const createProduct = at("POST", "/v1/products");
const lookUpPrice = at("GET", "/v1/prices");
const createPrice = at("POST", "/v1/prices");

const stripeAccount = (answers: ReadonlyArray<readonly [(call: StripeCall) => boolean, (call: StripeCall) => StripeAnswer]>) =>
  (call: StripeCall) => answers.find(([matches]) => matches(call))?.[1](call);

const emptyAccount = stripeAccount([
  [searchProducts, () => stripeList([])],
  [listProducts, () => stripeList([product("prod_other", { app: "another-app" })])],
  [createProduct, () => ({ status: 200, body: product("prod_new") })],
  [lookUpPrice, () => stripeList([])],
  [createPrice, ({ form }) => {
    const interval = form.get("recurring[interval]") ?? "";
    return {
      status: 200,
      body: price(`price_new_${interval}`, interval, { product: form.get("product"), unit_amount: Number(form.get("unit_amount")) }),
    };
  }],
]);

const accountWithTheProProductAndItsMonthlyPrice = stripeAccount([
  [searchProducts, () => stripeList([product("prod_pro")])],
  [lookUpPrice, () => stripeList([price("price_existing", "month")])],
]);

const bootstrap = (args: string[], options: Parameters<typeof runStripeScript>[1] = {}) =>
  runStripeScript(SCRIPT, { devVars: TEST_KEY, ...options, args });

describe("the Stripe bootstrap (scripts/stripe/bootstrap.ts) in the test account", () => {
  it("creates the Pro product and its monthly and yearly prices in an empty account", async () => {
    const run = await bootstrap(["--mode", "test", "--monthly", "900", "--yearly", "9000"], { route: emptyAccount });

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("[test]\nProduct: prod_new\nMonthly price: price_new_month (900 usd / month)\nYearly price: price_new_year (9000 usd / year)");
    expect(run.calls.every((call) => call.secretKey === "sk_test_bootstrap")).toBe(true);
    expect(run.calls.find(searchProducts)?.query.get("query")).toBe("metadata['app']:'serp-checklists' AND metadata['tier']:'pro'");
    expect(Object.fromEntries(run.calls.find(createProduct)?.form ?? [])).toEqual({
      name: "SERP Lists Pro",
      description: "Pro subscription for SERP Lists",
      "metadata[app]": "serp-checklists",
      "metadata[tier]": "pro",
    });
    const createdPrices = run.calls.filter(createPrice).map((call) => Object.fromEntries(call.form));
    expect(createdPrices).toEqual([
      objectContaining({ product: "prod_new", unit_amount: "900", currency: "usd", lookup_key: "serp-checklists_pro_monthly" }),
      objectContaining({ product: "prod_new", unit_amount: "9000", "recurring[interval]": "year", lookup_key: "serp-checklists_pro_yearly" }),
    ]);
  });

  it("reuses the product Stripe's search finds and the price under the lookup key, creating nothing", async () => {
    const run = await bootstrap(["--mode", "test", "--monthly", "900"], {
      route: accountWithTheProProductAndItsMonthlyPrice,
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Product: prod_pro\nMonthly price: price_existing (900 usd / month)");
    expect(run.stdout).not.toContain("Yearly price");
    expect(run.calls.filter((call) => call.method === "POST")).toEqual([]);
  });

  it("finds the product in the product list when Stripe's search is unavailable", async () => {
    const run = await bootstrap(["--mode", "test", "--monthly", "900", "--currency", "USD"], {
      route: stripeAccount([
        [searchProducts, () => ({ status: 400, body: { error: { message: "Search is not available" } } })],
        [listProducts, () => stripeList([product("prod_bare", null), product("prod_pro")])],
        [lookUpPrice, () => stripeList([price("price_existing", "month")])],
      ]),
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Product: prod_pro");
    expect(run.calls.filter(createProduct)).toEqual([]);
  });

  it("refuses a price under the lookup key that no longer matches the requested amount", async () => {
    const run = await bootstrap(["--mode", "test", "--monthly", "1200"], {
      route: accountWithTheProProductAndItsMonthlyPrice,
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Price price_existing (lookup key serp-checklists_pro_monthly) has unit_amount 900 (requested 1200).");
    expect(run.calls.filter(createPrice)).toEqual([]);
  });

  it("names the request and Stripe's answer when Stripe refuses one", async () => {
    const run = await bootstrap(["--mode", "test", "--monthly", "900"], {
      route: stripeAccount([
        [searchProducts, () => stripeList([])],
        [listProducts, () => stripeList([])],
        [createProduct, () => ({ status: 403, body: { error: { message: "Restricted key" } } })],
      ]),
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Stripe API error (403) /v1/products: {"error":{"message":"Restricted key"}}');
  });
});

describe("the Stripe bootstrap in the live account, against the stand-in", () => {
  const liveKeyInTheEnvironment = { STRIPE_LIVE_SECRET_KEY: "sk_live_stand_in_only" };

  it("uses only the key injected into the process for --mode live", async () => {
    const run = await bootstrap(["--mode", "live", "--monthly", "900"], {
      env: liveKeyInTheEnvironment,
      route: accountWithTheProProductAndItsMonthlyPrice,
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("[live]\nProduct: prod_pro");
    expect(run.stdout).not.toContain("[test]");
    expect(new Set(run.calls.map((call) => call.secretKey))).toEqual(new Set(["sk_live_stand_in_only"]));
  });

  it("sets up the test account with the local key, then the live account with the injected key, for --mode both", async () => {
    const run = await bootstrap(["--monthly", "900"], { env: liveKeyInTheEnvironment, route: accountWithTheProProductAndItsMonthlyPrice });

    expect(run.status).toBe(0);
    expect(run.stdout.indexOf("[test]")).toBeLessThan(run.stdout.indexOf("[live]"));
    expect(run.calls.map((call) => [call.path, call.secretKey])).toEqual([
      ["/v1/products/search", "sk_test_bootstrap"],
      ["/v1/prices", "sk_test_bootstrap"],
      ["/v1/products/search", "sk_live_stand_in_only"],
      ["/v1/prices", "sk_live_stand_in_only"],
    ]);
  });
});

describe("the Stripe bootstrap's options and keys", () => {
  it("prints its usage for --help", async () => {
    const run = await bootstrap(["--help"]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("--mode test|live|both");
    expect(run.calls).toEqual([]);
  });

  it("shows what a dry run would create in both accounts without a key or a request", async () => {
    const run = await bootstrap(["--dry-run", "--monthly", "900", "--yearly", "9000"], { devVars: "" });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("[test]\nProduct: (dry-run)\nMonthly price: (dry-run)\nYearly price: (dry-run)");
    expect(run.stdout).toContain("[live]\nProduct: (dry-run)");
    expect(run.calls).toEqual([]);
  });

  it.each([
    [["--dry-run", "--mode", "live", "--monthly", "900"], "[live]", "[test]"],
    [["--dry-run", "--mode", "test", "--monthly", "900"], "[test]", "[live]"],
    [["live", "--dry-run", "--mode", "test", "--monthly", "900"], "[test]", "[live]"],
  ])("dry-runs only the account %j names", async (args, shown, notShown) => {
    const run = await bootstrap(args);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(shown);
    expect(run.stdout).not.toContain(notShown);
  });

  it.each([
    [["--mode", "sandbox", "--monthly", "900"], "--mode must be test|live|both (got: sandbox)"],
    [["--mode", "test"], "--monthly must be a positive integer (cents), got: undefined"],
    [["--mode", "test", "--monthly", "900", "--yearly", "-5"], "--yearly must be a positive integer (cents), got: -5"],
    [["--mode", "live", "--monthly", "900"], "Live mode requires STRIPE_LIVE_SECRET_KEY injected through the process environment."],
    [["--monthly", "900"], "For --mode both, set a local test key and inject STRIPE_LIVE_SECRET_KEY"],
  ])("refuses %j", async (args, refusal) => {
    const run = await bootstrap(args);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(refusal);
    expect(run.calls).toEqual([]);
  });

  it("needs a test key for --mode test", async () => {
    const run = await bootstrap(["--mode", "test", "--monthly", "900"], { devVars: "STRIPE_SECRET_KEY=sk_live_in_a_file\n" });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Missing Stripe test secret key.");
    expect(run.calls).toEqual([]);
  });
});

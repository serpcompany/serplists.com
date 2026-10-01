import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PRO_MONTHLY_PRICE_LABEL } from "@/lib/billing";
import {
  bootstrapUsage,
  describePrice,
  ensurePrice,
  PRO_MONTHLY_CENTS,
} from "../../../scripts/stripe/_bootstrap-lib.mjs";

const MONTHLY = {
  productId: "prod_pro",
  lookupKey: "serp-checklists_pro_monthly",
  currency: "usd",
  unitAmount: 900,
  interval: "month",
};

function price(overrides: Record<string, unknown> = {}) {
  return {
    id: "price_existing",
    active: true,
    type: "recurring",
    product: "prod_pro",
    unit_amount: 900,
    currency: "usd",
    recurring: { interval: "month", interval_count: 1 },
    ...overrides,
  };
}

function fakeStripeWhoseLookupFinds(found: unknown[]) {
  return vi.fn(async ({ method }: { method: string }) =>
    method === "GET" ? { data: found } : { id: "price_created" },
  );
}

describe("ensurePrice", () => {
  it("reuses a matching price without creating one", async () => {
    const request = fakeStripeWhoseLookupFinds([price()]);

    await expect(ensurePrice({ request, ...MONTHLY })).resolves.toMatchObject({ id: "price_existing" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an archived price", price({ active: false }), "archived"],
    ["another product's price", price({ product: { id: "prod_other" } }), "product prod_other"],
    ["a one-time price", price({ type: "one_time", recurring: null }), "type one_time"],
    ["a price billed every 3 months", price({ recurring: { interval: "month", interval_count: 3 } }), "every 3"],
    ["a different amount", price({ unit_amount: 1900 }), "unit_amount 1900"],
  ])("refuses %s instead of reporting it as the price to use", async (_label, existing, detail) => {
    const request = fakeStripeWhoseLookupFinds([existing]);

    await expect(ensurePrice({ request, ...MONTHLY })).rejects.toThrow(detail);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("accepts a price whose product is expanded", async () => {
    const request = fakeStripeWhoseLookupFinds([price({ product: { id: "prod_pro" } })]);

    await expect(ensurePrice({ request, ...MONTHLY })).resolves.toMatchObject({ id: "price_existing" });
  });

  it("creates the requested price when the lookup key is free", async () => {
    const request = fakeStripeWhoseLookupFinds([]);

    await ensurePrice({ request, ...MONTHLY });

    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({
      method: "POST",
      path: "/v1/prices",
      form: expect.objectContaining({
        product: "prod_pro",
        currency: "usd",
        unit_amount: "900",
        "recurring[interval]": "month",
        lookup_key: "serp-checklists_pro_monthly",
      }),
    }));
  });

  it("skips the check in a dry run, which returns no data", async () => {
    const request = vi.fn(async () => ({ dryRun: true }));

    await expect(ensurePrice({ request, ...MONTHLY })).resolves.toMatchObject({ dryRun: true });
  });
});

describe("bootstrap price documentation", () => {
  it("prints the amount next to each price id", () => {
    expect(describePrice(price())).toBe("price_existing (900 usd / month)");
  });

  it("keeps the help example, the docs, and the UI label on the same monthly price", () => {
    expect(PRO_MONTHLY_PRICE_LABEL).toBe(`$${PRO_MONTHLY_CENTS / 100}/month`);
    expect(bootstrapUsage()).toContain(`--monthly ${PRO_MONTHLY_CENTS}`);
    expect(bootstrapUsage()).not.toMatch(/--(monthly|yearly) (?!900\b)\d+/);

    const billingDoc = readFileSync(new URL("../../../docs/design-docs/billing.md", import.meta.url), "utf8");
    const documented = [...billingDoc.matchAll(/--monthly (\d+)/g)].map((match) => Number(match[1]));
    expect(documented.length).toBeGreaterThan(0);
    expect(new Set(documented)).toEqual(new Set([PRO_MONTHLY_CENTS]));
  });
});

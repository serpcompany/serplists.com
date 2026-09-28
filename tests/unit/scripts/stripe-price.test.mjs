import { describe, expect, it } from "vitest";

import { describePriceMismatch } from "../../../scripts/stripe/_price.mjs";

const existing = {
  id: "price_old",
  active: true,
  type: "recurring",
  product: "prod_pro",
  unit_amount: 900,
  currency: "usd",
  recurring: { interval: "month", interval_count: 1 },
};

describe("Stripe bootstrap price lookup", () => {
  it("reuses a price that matches the request", () => {
    expect(describePriceMismatch(existing, { unitAmount: 900, currency: "usd", interval: "month" })).toBeNull();
  });

  it("reports a changed amount instead of silently reusing the old price", () => {
    expect(describePriceMismatch(existing, { unitAmount: 1200, currency: "usd", interval: "month" }))
      .toBe("unit_amount 900 (requested 1200)");
  });

  it("reports an archived price, another product, a one-time price, or a longer billing cycle", () => {
    const requested = { unitAmount: 900, currency: "usd", interval: "month", productId: "prod_pro" };

    expect(describePriceMismatch({ ...existing, active: false }, requested)).toBe("archived (active false)");
    expect(describePriceMismatch({ ...existing, product: { id: "prod_other" } }, requested))
      .toBe("product prod_other (requested prod_pro)");
    expect(describePriceMismatch({ ...existing, product: { id: "prod_pro" } }, requested)).toBeNull();
    expect(describePriceMismatch({ ...existing, type: "one_time", recurring: null }, requested))
      .toBe("type one_time (requested recurring), interval undefined (requested month)");
    expect(describePriceMismatch({ ...existing, recurring: { interval: "month", interval_count: 3 } }, requested))
      .toBe("billed every 3 month (requested every 1 month)");
  });

  it("reports a changed currency or interval", () => {
    expect(describePriceMismatch(existing, { unitAmount: 900, currency: "eur", interval: "year" }))
      .toBe("currency usd (requested eur), interval month (requested year)");
  });
});

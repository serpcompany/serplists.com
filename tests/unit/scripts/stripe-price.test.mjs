import { describe, expect, it } from "vitest";

import { describePriceMismatch } from "../../../scripts/stripe/_price.mjs";

const existing = { id: "price_old", unit_amount: 900, currency: "usd", recurring: { interval: "month" } };

describe("Stripe bootstrap price lookup", () => {
  it("reuses a price that matches the request", () => {
    expect(describePriceMismatch(existing, { unitAmount: 900, currency: "usd", interval: "month" })).toBeNull();
  });

  it("reports a changed amount instead of silently reusing the old price", () => {
    expect(describePriceMismatch(existing, { unitAmount: 1200, currency: "usd", interval: "month" }))
      .toBe("unit_amount 900 (requested 1200)");
  });

  it("reports a changed currency or interval", () => {
    expect(describePriceMismatch(existing, { unitAmount: 900, currency: "eur", interval: "year" }))
      .toBe("currency usd (requested eur), interval month (requested year)");
  });
});

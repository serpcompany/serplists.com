import { describePriceMismatch, PRO_CURRENCY, PRO_MONTHLY_CENTS } from "./_price.mjs";

export { PRO_MONTHLY_CENTS };

export function bootstrapUsage() {
  return `Usage:
  node scripts/stripe/bootstrap.mjs --mode test --currency ${PRO_CURRENCY} --monthly ${PRO_MONTHLY_CENTS} [--yearly <cents>] [--dry-run]

  --mode test|live|both   Stripe account(s) to set up (default: both).
  --monthly <cents>       Pro monthly price in cents; the launch price is ${PRO_MONTHLY_CENTS}.
  --yearly <cents>        Optional yearly price in cents.

An existing price under the lookup key is reused only when it is active, on the Pro
product, and matches the requested amount, currency, and interval. Otherwise the run
fails: Stripe prices cannot change (see "Changing the Pro price" in
docs/design-docs/billing.md).

Reads keys from .env / .env.local / .dev.vars:
  STRIPE_TEST_SECRET_KEY=sk_test_...
  STRIPE_LIVE_SECRET_KEY=sk_live_...

Or a single STRIPE_SECRET_KEY (sk_test_... or sk_live_...) for single-mode runs.
`;
}

/** A price id with its amount, for bootstrap output. */
export function describePrice(price) {
  if (!price?.id) return "(dry-run)";
  return `${price.id} (${price.unit_amount} ${price.currency} / ${price.recurring?.interval})`;
}

/**
 * Returns the price under `lookupKey`, creating it when the key is free. `request`
 * sends one Stripe API call ({ method, path, form }); a dry run returns no data, so
 * nothing is checked.
 */
export async function ensurePrice({ request, productId, lookupKey, currency, unitAmount, interval }) {
  const lookupResp = await request({
    method: "GET",
    path: `/v1/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&limit=1`,
  });

  const existing = lookupResp?.data?.[0];
  if (existing?.id) {
    const mismatch = describePriceMismatch(existing, { unitAmount, currency, interval, productId });
    if (mismatch) {
      throw new Error(
        `Price ${existing.id} (lookup key ${lookupKey}) has ${mismatch}. Stripe prices cannot change; ` +
          "follow the Pro price change procedure in docs/design-docs/billing.md.",
      );
    }
    return existing;
  }

  return request({
    method: "POST",
    path: "/v1/prices",
    form: {
      product: productId,
      currency,
      unit_amount: String(unitAmount),
      "recurring[interval]": interval,
      lookup_key: lookupKey,
      "metadata[app]": "serp-checklists",
      "metadata[tier]": "pro",
    },
  });
}

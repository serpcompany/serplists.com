import { z } from "zod";
import { describePriceMismatch, PRO_CURRENCY, PRO_MONTHLY_CENTS } from "./_price";
import { stripeListOf, stripePriceSchema, type StripeReplySchema } from "./_stripe-objects";

export { PRO_MONTHLY_CENTS };

export type StripeRequest = (options: {
  method: "GET" | "POST";
  path: string;
  form?: Record<string, string>;
  schema: StripeReplySchema<unknown>;
}) => Promise<unknown>;

export const dryRunReplySchema = z.object({ dryRun: z.literal(true) }).passthrough();

const priceLookupSchema = z.union([stripeListOf(stripePriceSchema), dryRunReplySchema]);
const priceSummarySchema = z.object({
  id: z.string().optional(),
  unit_amount: z.unknown(),
  currency: z.unknown(),
  recurring: z.object({ interval: z.unknown() }).nullish(),
});

export function bootstrapUsage(): string {
  return `Usage:
  node --import tsx scripts/stripe/bootstrap.ts --mode test --currency ${PRO_CURRENCY} --monthly ${PRO_MONTHLY_CENTS} [--yearly <cents>] [--dry-run]

  --mode test|live|both   Stripe account(s) to set up (default: both).
  --monthly <cents>       Pro monthly price in cents; the launch price is ${PRO_MONTHLY_CENTS}.
  --yearly <cents>        Optional yearly price in cents.

An existing price under the lookup key is reused only when it is active, on the Pro
product, and matches the requested amount, currency, and interval. Otherwise the run
fails: Stripe prices cannot change (see "Changing the Pro price" in
docs/design-docs/billing.md).

Reads the test key from .env / .env.local / .dev.vars:
  STRIPE_SECRET_KEY=sk_test_...   (STRIPE_TEST_SECRET_KEY overrides it)

Reads the live key only from the process environment, never from a file:
  STRIPE_LIVE_SECRET_KEY=sk_live_...   (or STRIPE_SECRET_KEY=sk_live_...)
`;
}

export function describePrice(price: unknown): string {
  const summary = priceSummarySchema.safeParse(price);
  if (!summary.success || !summary.data.id) return "(dry-run)";
  const { id, unit_amount: unitAmount, currency, recurring } = summary.data;
  return `${id} (${String(unitAmount)} ${String(currency)} / ${String(recurring?.interval)})`;
}

export async function ensurePrice({
  request,
  productId,
  lookupKey,
  currency,
  unitAmount,
  interval,
}: {
  request: StripeRequest;
  productId: string;
  lookupKey: string;
  currency: string;
  unitAmount: number;
  interval: string;
}): Promise<unknown> {
  const lookup = priceLookupSchema.parse(
    await request({
      method: "GET",
      path: `/v1/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&limit=1`,
      schema: stripeListOf(stripePriceSchema),
    }),
  );

  const existing = "dryRun" in lookup ? undefined : lookup.data[0];
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
    schema: stripePriceSchema,
  });
}

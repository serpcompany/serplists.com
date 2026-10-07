import type { StripePrice } from "./_stripe-objects";

export const PRO_MONTHLY_CENTS = 900;
export const PRO_CURRENCY = "usd";

export type RequestedPrice = { unitAmount: number; currency: string; interval: string; productId?: string };

function productIdOf(product: StripePrice["product"]): string {
  return typeof product === "object" ? product.id : product;
}

export function describePriceMismatch(
  existing: Omit<StripePrice, "id">,
  { unitAmount, currency, interval, productId }: RequestedPrice,
): string | null {
  const differences: string[] = [];
  if (existing.active !== true) {
    differences.push(`archived (active ${existing.active})`);
  }
  if (existing.type !== "recurring") {
    differences.push(`type ${existing.type} (requested recurring)`);
  }
  if (productId && productIdOf(existing.product) !== productId) {
    differences.push(`product ${productIdOf(existing.product)} (requested ${productId})`);
  }
  if (existing.unit_amount !== unitAmount) {
    differences.push(`unit_amount ${existing.unit_amount} (requested ${unitAmount})`);
  }
  if (String(existing.currency).toLowerCase() !== currency) {
    differences.push(`currency ${existing.currency} (requested ${currency})`);
  }
  if (existing.recurring?.interval !== interval) {
    differences.push(`interval ${existing.recurring?.interval} (requested ${interval})`);
  } else if ((existing.recurring.interval_count ?? 1) !== 1) {
    differences.push(`billed every ${existing.recurring.interval_count} ${interval} (requested every 1 ${interval})`);
  }
  return differences.length > 0 ? differences.join(", ") : null;
}

export const PRO_MONTHLY_CENTS = 900;
export const PRO_CURRENCY = "usd";

function productIdOf(product) {
  return product && typeof product === "object" ? product.id : product;
}

export function describePriceMismatch(existing, { unitAmount, currency, interval, productId }) {
  const differences = [];
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
  } else if ((existing.recurring?.interval_count ?? 1) !== 1) {
    differences.push(`billed every ${existing.recurring.interval_count} ${interval} (requested every 1 ${interval})`);
  }
  return differences.length > 0 ? differences.join(", ") : null;
}

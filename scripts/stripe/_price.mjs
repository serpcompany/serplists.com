/**
 * Stripe prices cannot change their amount, currency, or interval. Returns why a price
 * found by lookup key differs from the one requested, or null when it matches, so a
 * bootstrap run never hands back the old price id after a price change.
 */
export function describePriceMismatch(existing, { unitAmount, currency, interval }) {
  const differences = [];
  if (existing.unit_amount !== unitAmount) {
    differences.push(`unit_amount ${existing.unit_amount} (requested ${unitAmount})`);
  }
  if (String(existing.currency).toLowerCase() !== currency) {
    differences.push(`currency ${existing.currency} (requested ${currency})`);
  }
  if (existing.recurring?.interval !== interval) {
    differences.push(`interval ${existing.recurring?.interval} (requested ${interval})`);
  }
  return differences.length > 0 ? differences.join(", ") : null;
}

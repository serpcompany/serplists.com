export type BillingPlan = "free" | "pro" | "team";

export const PRO_MONTHLY_PRICE_LABEL = "$9/month";

export const getBillingStatusQueryKey = (
  userId?: string | null,
  teamId?: string | null,
) => ["billing", "status", userId ?? "guest", teamId ?? "personal"] as const;

// "team" is the legacy stored value for a paid Organization (see docs/product-specs/pricing-and-entitlements.md).
export const getBillingPlanLabel = (plan?: BillingPlan | null): "Free" | "Pro" | "Paid" | null => {
  if (plan === "team") return "Paid";
  if (plan === "pro") return "Pro";
  if (plan === "free") return "Free";
  return null;
};

export type BillingStatus = {
  plan: BillingPlan;
  limits?: { maxTemplates: number | null; maxActiveRuns: number | null };
  billingEnabled?: boolean;
  /** Personal only: the most urgent open (not canceled or expired) Stripe subscription status, or null. */
  subscriptionStatus?: string | null;
  /** Personal only: a Stripe customer exists, so the Customer Portal can open. */
  canManageBilling?: boolean;
};

const PAID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const FAILED_PAYMENT_SUBSCRIPTION_STATUSES = new Set(["past_due", "unpaid"]);

/**
 * A Personal user with Pro or any open Stripe subscription manages it in the Customer
 * Portal. Starting Checkout again would create a second subscription that Stripe bills.
 */
export const getPersonalBillingAction = (status?: BillingStatus | null): "manage" | "upgrade" =>
  status?.plan === "pro" || status?.subscriptionStatus ? "manage" : "upgrade";

/** Explains an open subscription that is not paid up, or returns null. */
export const getSubscriptionAttentionMessage = (subscriptionStatus?: string | null): string | null => {
  if (!subscriptionStatus || PAID_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) return null;
  if (FAILED_PAYMENT_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    return "Your last Pro payment failed. Update your payment method to restore Pro.";
  }
  return "Your Pro subscription needs attention. Open Manage subscription to resolve it.";
};

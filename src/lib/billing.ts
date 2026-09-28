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
  /** Personal only: a manual override sets the plan, so self-serve checkout is closed. */
  managedBySupport?: boolean;
};

export const PLAN_MANAGED_BY_SUPPORT_MESSAGE = "Your plan is managed by support. Contact support to change it.";

const PAID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const FAILED_PAYMENT_SUBSCRIPTION_STATUSES = new Set(["past_due", "unpaid"]);

/**
 * A Personal user with Pro or any open Stripe subscription manages it in the Customer
 * Portal. Starting Checkout again would create a second subscription that Stripe bills.
 * When support manages the plan there is no self-serve action, except the portal for
 * an existing Stripe customer so a subscription can still be canceled. Pro without a
 * Stripe customer has no portal to open, so it is left to support too. A status
 * without canManageBilling keeps the portal.
 */
export const getPersonalBillingAction = (status?: BillingStatus | null): "manage" | "upgrade" | "support" => {
  if (status?.managedBySupport) return "support";
  if (status?.plan === "pro") return status.canManageBilling === false ? "support" : "manage";
  return status?.subscriptionStatus ? "manage" : "upgrade";
};

/** Explains an open subscription that is not paid up, or returns null. */
export const getSubscriptionAttentionMessage = (subscriptionStatus?: string | null): string | null => {
  if (!subscriptionStatus || PAID_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) return null;
  if (FAILED_PAYMENT_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    return "Your last Pro payment failed. Update your payment method to restore Pro.";
  }
  return "Your Pro subscription needs attention. Open Manage subscription to resolve it.";
};

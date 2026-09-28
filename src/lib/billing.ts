import { isApiError } from "@/lib/api-errors";

export type BillingPlan = "free" | "pro" | "team";

export const PRO_MONTHLY_PRICE_LABEL = "$9/month";

/** Prefix of every billing status query key, for invalidating them all. */
export const BILLING_STATUS_QUERY_PREFIX = ["billing", "status"] as const;

export const getBillingStatusQueryKey = (
  userId?: string | null,
  teamId?: string | null,
) => [...BILLING_STATUS_QUERY_PREFIX, userId ?? "guest", teamId ?? "personal"] as const;

// "unknown" means billing status failed to load. It is neither Free nor paid: do not
// show upgrade prompts or plan gates for it, offer a retry instead.
export type BillingPlanStatus = BillingPlan | "loading" | "unknown";

export const PLAN_UNKNOWN_MESSAGE = "Couldn't check your plan. Try again.";

export const getBillingPlanStatus = (query: {
  data?: { plan: BillingPlan } | null;
  isError: boolean;
}): BillingPlanStatus => {
  if (query.data) return query.data.plan;
  return query.isError ? "unknown" : "loading";
};

// "team" is the legacy stored value for a paid Organization (see docs/product-specs/pricing-and-entitlements.md).
export const getBillingPlanLabel = (plan?: BillingPlan | null): "Free" | "Pro" | "Paid" | null => {
  if (plan === "team") return "Paid";
  if (plan === "pro") return "Pro";
  if (plan === "free") return "Free";
  return null;
};

export const isPaidBillingPlan = (plan: BillingPlan): boolean => plan === "pro" || plan === "team";

export type BillingStatusData = {
  billingEnabled?: boolean;
  plan: BillingPlan;
};

/**
 * What the client knows about the active context's plan. Only "known" carries a
 * plan: a failed or pending request is never treated as Free, so no upgrade prompt
 * or checkout is offered until the server has said the plan is Free.
 */
export type BillingStatusState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "known"; billingEnabled: boolean; isPaid: boolean; plan: BillingPlan };

export const resolveBillingStatus = (query: {
  data?: BillingStatusData;
  fetchStatus: "fetching" | "paused" | "idle";
  isError: boolean;
}): BillingStatusState => {
  // React Query keeps the last data when a background refetch fails, so data wins.
  if (query.data) {
    return {
      status: "known",
      billingEnabled: query.data.billingEnabled ?? true,
      isPaid: isPaidBillingPlan(query.data.plan),
      plan: query.data.plan,
    };
  }

  if (query.isError) {
    return { status: "error" };
  }

  // A disabled query (signed out) is pending but idle; it is not loading.
  return query.fetchStatus === "idle" ? { status: "idle" } : { status: "loading" };
};

const MAX_BILLING_STATUS_RETRIES = 2;

/** Retries transient failures (5xx, network) but not 4xx such as 401 or a removed Organization's 404. */
export const shouldRetryBillingStatus = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= MAX_BILLING_STATUS_RETRIES) {
    return false;
  }

  return !(isApiError(error) && error.status >= 400 && error.status < 500);
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

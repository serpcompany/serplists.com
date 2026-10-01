import { isApiError } from "@/lib/api-errors";

export type BillingPlan = "free" | "pro" | "team";

export const PRO_MONTHLY_PRICE_LABEL = "$9/month";

export const BILLING_STATUS_QUERY_PREFIX = ["billing", "status"] as const;

export const getBillingStatusQueryKey = (
  userId?: string | null,
  teamId?: string | null,
) => [...BILLING_STATUS_QUERY_PREFIX, userId ?? "guest", teamId ?? "personal"] as const;

export type BillingPlanStatus = BillingPlan | "loading" | "unknown";

export const PLAN_UNKNOWN_MESSAGE = "Couldn't check your plan. Try again.";

export const getBillingPlanStatus = (query: {
  data?: { plan: BillingPlan } | null;
  isError: boolean;
}): BillingPlanStatus => {
  if (query.data) return query.data.plan;
  return query.isError ? "unknown" : "loading";
};

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

  return query.fetchStatus === "idle" ? { status: "idle" } : { status: "loading" };
};

const MAX_BILLING_STATUS_RETRIES = 2;

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
  subscriptionStatus?: string | null;
  canManageBilling?: boolean;
  managedBySupport?: boolean;
};

export const PLAN_MANAGED_BY_SUPPORT_MESSAGE = "Your plan is managed by support. Contact support to change it.";

const PAID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const FAILED_PAYMENT_SUBSCRIPTION_STATUSES = new Set(["past_due", "unpaid"]);

export const getPersonalBillingAction = (status?: BillingStatus | null): "manage" | "upgrade" | "support" => {
  if (status?.managedBySupport) return "support";
  if (status?.plan === "pro") return status.canManageBilling === false ? "support" : "manage";
  return status?.subscriptionStatus && status.subscriptionStatus !== "incomplete" ? "manage" : "upgrade";
};

export const getSubscriptionAttentionMessage = (subscriptionStatus?: string | null): string | null => {
  if (!subscriptionStatus || PAID_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) return null;
  if (FAILED_PAYMENT_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    return "Your last Pro payment failed. Update your payment method to restore Pro.";
  }
  return "Your Pro subscription needs attention. Open Manage subscription to resolve it.";
};

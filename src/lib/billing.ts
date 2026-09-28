import { isApiError } from "@/lib/api-errors";

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

export type BillingPlan = "free" | "pro" | "team";

export const PRO_MONTHLY_PRICE_LABEL = "$9/month";

export const getBillingStatusQueryKey = (
  userId?: string | null,
  teamId?: string | null,
) => ["billing", "status", userId ?? "guest", teamId ?? "personal"] as const;

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

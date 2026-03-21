export type BillingPlan = "free" | "pro";

export const getBillingStatusQueryKey = (userId?: string | null) =>
  ["billing", "status", userId ?? "guest"] as const;

export const getBillingPlanLabel = (plan?: BillingPlan | null): "Free" | "Pro" | null => {
  if (plan === "pro") return "Pro";
  if (plan === "free") return "Free";
  return null;
};

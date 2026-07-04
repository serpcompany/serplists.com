export type BillingPlan = "free" | "pro" | "team";

export const getBillingStatusQueryKey = (
  userId?: string | null,
  teamId?: string | null,
) => ["billing", "status", userId ?? "guest", teamId ?? "personal"] as const;

export const getBillingPlanLabel = (plan?: BillingPlan | null): "Free" | "Pro" | "Team" | null => {
  if (plan === "team") return "Team";
  if (plan === "pro") return "Pro";
  if (plan === "free") return "Free";
  return null;
};

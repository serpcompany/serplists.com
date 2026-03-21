import { describe, expect, it } from "vitest";
import { getBillingPlanLabel, getBillingStatusQueryKey } from "@/lib/billing";

describe("getBillingStatusQueryKey", () => {
  it("scopes the billing query to the current user", () => {
    expect(getBillingStatusQueryKey("user-1")).toEqual(["billing", "status", "user-1"]);
    expect(getBillingStatusQueryKey("user-2")).toEqual(["billing", "status", "user-2"]);
  });

  it("uses a stable guest key when no user is logged in", () => {
    expect(getBillingStatusQueryKey()).toEqual(["billing", "status", "guest"]);
    expect(getBillingStatusQueryKey(null)).toEqual(["billing", "status", "guest"]);
  });

  it("does not treat an unknown billing plan as free", () => {
    expect(getBillingPlanLabel("pro")).toBe("Pro");
    expect(getBillingPlanLabel("free")).toBe("Free");
    expect(getBillingPlanLabel()).toBeNull();
    expect(getBillingPlanLabel(null)).toBeNull();
  });
});

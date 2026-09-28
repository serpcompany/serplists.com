import { describe, expect, it } from "vitest";
import { getBillingPlanLabel, getBillingPlanStatus, getBillingStatusQueryKey } from "@/lib/billing";

describe("getBillingPlanStatus", () => {
  it("never guesses a plan while billing status is loading or failed", () => {
    expect(getBillingPlanStatus({ data: undefined, isError: false })).toBe("loading");
    expect(getBillingPlanStatus({ data: undefined, isError: true })).toBe("unknown");
  });

  it("uses the loaded plan, even when a later refresh failed", () => {
    expect(getBillingPlanStatus({ data: { plan: "pro" }, isError: false })).toBe("pro");
    expect(getBillingPlanStatus({ data: { plan: "team" }, isError: true })).toBe("team");
    expect(getBillingPlanStatus({ data: { plan: "free" }, isError: false })).toBe("free");
  });
});

describe("getBillingStatusQueryKey", () => {
  it("scopes the billing query to the current user", () => {
    expect(getBillingStatusQueryKey("user-1")).toEqual(["billing", "status", "user-1", "personal"]);
    expect(getBillingStatusQueryKey("user-2")).toEqual(["billing", "status", "user-2", "personal"]);
  });

  it("scopes team billing reads to the active team workspace", () => {
    expect(getBillingStatusQueryKey("user-1", "team-1")).toEqual([
      "billing",
      "status",
      "user-1",
      "team-1",
    ]);
  });

  it("uses a stable guest key when no user is logged in", () => {
    expect(getBillingStatusQueryKey()).toEqual(["billing", "status", "guest", "personal"]);
    expect(getBillingStatusQueryKey(null)).toEqual(["billing", "status", "guest", "personal"]);
  });

  it("does not treat an unknown billing plan as free", () => {
    expect(getBillingPlanLabel("team")).toBe("Paid");
    expect(getBillingPlanLabel("pro")).toBe("Pro");
    expect(getBillingPlanLabel("free")).toBe("Free");
    expect(getBillingPlanLabel()).toBeNull();
    expect(getBillingPlanLabel(null)).toBeNull();
  });
});

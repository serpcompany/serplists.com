import { describe, expect, it } from "vitest";
import {
  getBillingPlanLabel,
  getBillingStatusQueryKey,
  getPersonalBillingAction,
  getSubscriptionAttentionMessage,
} from "@/lib/billing";

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

describe("getPersonalBillingAction", () => {
  it("offers checkout only when there is no Pro plan and no open subscription", () => {
    expect(getPersonalBillingAction({ plan: "free", subscriptionStatus: null })).toBe("upgrade");
    expect(getPersonalBillingAction({ plan: "free" })).toBe("upgrade");
    expect(getPersonalBillingAction(undefined)).toBe("upgrade");
  });

  it.each(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"])(
    "manages an open %s subscription instead of starting a second one",
    (subscriptionStatus) => {
      expect(getPersonalBillingAction({ plan: "free", subscriptionStatus })).toBe("manage");
    },
  );

  it("manages Pro", () => {
    expect(getPersonalBillingAction({ plan: "pro" })).toBe("manage");
  });
});

describe("getSubscriptionAttentionMessage", () => {
  it("explains a failed payment", () => {
    expect(getSubscriptionAttentionMessage("past_due")).toContain("payment failed");
    expect(getSubscriptionAttentionMessage("unpaid")).toContain("payment failed");
  });

  it("flags other open subscriptions that are not paid up", () => {
    expect(getSubscriptionAttentionMessage("paused")).toContain("needs attention");
    expect(getSubscriptionAttentionMessage("incomplete")).toContain("needs attention");
  });

  it("says nothing for a paid-up or missing subscription", () => {
    expect(getSubscriptionAttentionMessage("active")).toBeNull();
    expect(getSubscriptionAttentionMessage("trialing")).toBeNull();
    expect(getSubscriptionAttentionMessage(null)).toBeNull();
  });
});

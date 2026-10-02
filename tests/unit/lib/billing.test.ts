import { describe, expect, it } from "vitest";
import { createApiError } from "@/lib/api-errors";
import {
  getBillingPlanLabel,
  getBillingPlanStatus,
  getBillingStatusQueryKey,
  getPersonalBillingAction,
  getSubscriptionAttentionMessage,
  resolveBillingStatus,
  shouldRetryBillingStatus,
} from "@/lib/billing";

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

describe("resolveBillingStatus", () => {
  it("reports an error, not the Free plan, when the request failed with no data", () => {
    expect(resolveBillingStatus({ data: undefined, fetchStatus: "idle", isError: true })).toEqual({
      status: "error",
    });
  });

  it("keeps the known plan when a background refetch fails", () => {
    expect(
      resolveBillingStatus({
        data: { billingEnabled: true, plan: "pro" },
        fetchStatus: "idle",
        isError: true,
      }),
    ).toEqual({ status: "known", billingEnabled: true, isPaid: true, plan: "pro" });
  });

  it("counts the legacy team plan as paid and defaults billingEnabled to true", () => {
    expect(resolveBillingStatus({ data: { plan: "team" }, fetchStatus: "idle", isError: false })).toEqual({
      status: "known",
      billingEnabled: true,
      isPaid: true,
      plan: "team",
    });
    expect(
      resolveBillingStatus({ data: { billingEnabled: false, plan: "free" }, fetchStatus: "idle", isError: false }),
    ).toEqual({ status: "known", billingEnabled: false, isPaid: false, plan: "free" });
  });

  it("is loading while the first request is in flight or paused", () => {
    expect(resolveBillingStatus({ data: undefined, fetchStatus: "fetching", isError: false })).toEqual({
      status: "loading",
    });
    expect(resolveBillingStatus({ data: undefined, fetchStatus: "paused", isError: false })).toEqual({
      status: "loading",
    });
  });

  it("is idle when the query is disabled (signed out), not an error", () => {
    expect(resolveBillingStatus({ data: undefined, fetchStatus: "idle", isError: false })).toEqual({
      status: "idle",
    });
  });
});

describe("shouldRetryBillingStatus", () => {
  it("retries server and network failures", () => {
    expect(shouldRetryBillingStatus(0, createApiError(500, { error: "boom" }))).toBe(true);
    expect(shouldRetryBillingStatus(0, new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not retry client errors such as an expired session or a removed Organization", () => {
    expect(shouldRetryBillingStatus(0, createApiError(401, { error: "Unauthorized" }))).toBe(false);
    expect(shouldRetryBillingStatus(0, createApiError(404, { error: "Organization not found" }))).toBe(false);
  });

  it("stops after a bounded number of retries", () => {
    expect(shouldRetryBillingStatus(2, createApiError(500, { error: "boom" }))).toBe(false);
  });
});

describe("getPersonalBillingAction", () => {
  it("offers checkout only when there is no Pro plan and no open subscription", () => {
    expect(getPersonalBillingAction({ plan: "free", subscriptionStatus: null })).toBe("upgrade");
    expect(getPersonalBillingAction({ plan: "free" })).toBe("upgrade");
    expect(getPersonalBillingAction(undefined)).toBe("upgrade");
  });

  it.each(["active", "trialing", "past_due", "unpaid", "paused"])(
    "manages an open %s subscription instead of starting a second one",
    (subscriptionStatus) => {
      expect(getPersonalBillingAction({ plan: "free", subscriptionStatus })).toBe("manage");
    },
  );

  it("offers checkout again when the first payment did not go through, since only its checkout session can still pay it", () => {
    expect(getPersonalBillingAction({ plan: "free", subscriptionStatus: "incomplete", canManageBilling: true }))
      .toBe("upgrade");
  });

  it("manages Pro", () => {
    expect(getPersonalBillingAction({ plan: "pro", canManageBilling: true })).toBe("manage");
  });

  it("keeps the portal for Pro in a response from before canManageBilling existed", () => {
    expect(getPersonalBillingAction({ plan: "pro" })).toBe("manage");
  });

  it("leaves a plan that support manages to support, never to checkout", () => {
    expect(getPersonalBillingAction({ plan: "free", managedBySupport: true })).toBe("support");
    expect(getPersonalBillingAction({ plan: "free", managedBySupport: true, subscriptionStatus: "active" }))
      .toBe("support");
    expect(getPersonalBillingAction({ plan: "pro", managedBySupport: true, canManageBilling: false })).toBe("support");
    expect(getPersonalBillingAction({ plan: "pro", managedBySupport: true, canManageBilling: true })).toBe("support");
  });

  it("leaves Pro with no Stripe customer, which support granted in a response older than managedBySupport, to support, never to a portal that cannot open", () => {
    expect(getPersonalBillingAction({ plan: "pro", canManageBilling: false })).toBe("support");
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

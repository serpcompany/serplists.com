import { describe, expect, it } from "vitest";
import { createApiError } from "@/lib/api-errors";
import {
  getBillingPlanLabel,
  getBillingStatusQueryKey,
  resolveBillingStatus,
  shouldRetryBillingStatus,
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

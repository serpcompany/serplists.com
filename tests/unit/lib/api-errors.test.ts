import { describe, expect, it } from "vitest";

import {
  ApiError,
  BILLING_UNAVAILABLE_MESSAGE,
  createApiError,
  getAccessFailure,
  isBillingCustomerMissingError,
  isOpenSubscriptionConflictError,
  getLimitContext,
} from "@/lib/api-errors";

describe("api-errors", () => {
  it("preserves structured API fields", () => {
    const error = createApiError(403, {
      error: "Upgrade to Pro to continue.",
      code: "upgrade_required",
      details: { resource: "templates" },
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe("upgrade_required");
    expect(error.details).toEqual({ resource: "templates" });
    expect(error.message).toBe("Upgrade to Pro to continue.");
  });

  it("maps unauthorized responses to auth_required", () => {
    expect(getAccessFailure(createApiError(401, { error: "Unauthorized" }), "fallback")).toEqual({
      kind: "auth_required",
      message: "Sign in to continue.",
    });
  });

  it("keeps server errors retryable instead of asking a signed-in user to sign in, since a failed session lookup answers 500", () => {
    expect(getAccessFailure(createApiError(500, { error: "Internal Server Error" }), "fallback")).toEqual({
      kind: "error",
      message: "Internal Server Error",
    });
  });

  it("maps upgrade and limit errors to upgrade_required", () => {
    expect(getAccessFailure(createApiError(403, { error: "Upgrade", code: "upgrade_required" }), "fallback")).toEqual({
      kind: "upgrade_required",
      message: "Upgrade",
    });

    expect(getAccessFailure(createApiError(403, { error: "Template limit reached", code: "limit_reached" }), "fallback")).toEqual({
      kind: "upgrade_required",
      message: "Template limit reached",
    });
  });

  it("keeps a Personal limit, or one with no context, as upgrade_required", () => {
    const personal = createApiError(403, {
      error: "Active run limit reached. Upgrade to Pro to create more checklist runs.",
      code: "limit_reached",
      details: { limit: 1, current: 1, resource: "active_runs", context: "personal" },
    });

    expect(getAccessFailure(personal, "fallback")).toEqual({
      kind: "upgrade_required",
      message: "Active run limit reached. Upgrade to Pro to create more checklist runs.",
    });
    expect(getLimitContext(personal)).toBe("personal");
    expect(getLimitContext(createApiError(403, { code: "limit_reached", details: { limit: 1 } }))).toBeNull();
  });

  it("maps an Organization limit to a plain error, never to a Pro checkout", () => {
    const message = "Active run limit reached. This Organization needs a paid plan to create more checklist runs.";
    const organization = createApiError(403, {
      error: message,
      code: "limit_reached",
      details: { limit: 1, current: 1, resource: "active_runs", context: "organization" },
    });

    expect(getLimitContext(organization)).toBe("organization");
    expect(getAccessFailure(organization, "fallback")).toEqual({ kind: "error", message });
  });

  it("ignores a malformed limit context", () => {
    const error = createApiError(403, {
      error: "Template limit reached",
      code: "limit_reached",
      details: { context: "workspace" },
    });

    expect(getLimitContext(error)).toBeNull();
    expect(getAccessFailure(error, "fallback").kind).toBe("upgrade_required");
  });

  it("maps billing_unavailable explicitly", () => {
    expect(getAccessFailure(createApiError(503, { error: "Billing is down", code: "billing_unavailable" }), "fallback")).toEqual({
      kind: "billing_unavailable",
      message: BILLING_UNAVAILABLE_MESSAGE,
    });
  });

  it("falls back to a readable error message for unknown failures", () => {
    expect(getAccessFailure(new Error("Something went wrong"), "fallback")).toEqual({
      kind: "error",
      message: "Something went wrong",
    });
  });
  it("maps a checkout blocked by an open subscription to subscription_needs_attention", () => {
    expect(getAccessFailure(createApiError(409, {
      error: "Your Pro subscription needs attention.",
      code: "subscription_needs_attention",
    }), "fallback")).toEqual({
      kind: "subscription_needs_attention",
      message: "Your Pro subscription needs attention.",
    });
  });

  it("recognizes checkout refusals that mean billing status is out of date, so the page refetches it", () => {
    expect(isOpenSubscriptionConflictError(createApiError(409, { code: "already_subscribed" }))).toBe(true);
    expect(isOpenSubscriptionConflictError(createApiError(409, { code: "subscription_needs_attention" }))).toBe(true);
    expect(isOpenSubscriptionConflictError(createApiError(409, { code: "plan_managed_by_support" }))).toBe(false);
    expect(isOpenSubscriptionConflictError(createApiError(503, { code: "billing_unavailable" }))).toBe(false);
    expect(isOpenSubscriptionConflictError(new Error("already_subscribed"))).toBe(false);
  });

  it("recognizes a portal refusal for a billing account Stripe no longer has, after which the page refetches billing status to offer Upgrade", () => {
    expect(isBillingCustomerMissingError(createApiError(409, { code: "billing_customer_missing" }))).toBe(true);
    expect(isBillingCustomerMissingError(createApiError(409, { code: "no_billing_account" }))).toBe(false);
    expect(isBillingCustomerMissingError(new Error("billing_customer_missing"))).toBe(false);
  });
});

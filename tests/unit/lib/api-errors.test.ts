import { describe, expect, it } from "vitest";

import {
  ApiError,
  BILLING_UNAVAILABLE_MESSAGE,
  createApiError,
  getAccessFailure,
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
});

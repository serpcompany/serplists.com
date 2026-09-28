import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
}));

const entitlementsMocks = vi.hoisted(() => ({
  getEntitlementsForContext: vi.fn(),
  getEntitlementsForUser: vi.fn(),
}));

const subscriptionMocks = vi.hoisted(() => ({
  getPersonalSubscriptionSummary: vi.fn(),
}));

const teamAccessMocks = vi.hoisted(() => ({
  canViewTeam: vi.fn(),
  getActiveTeamMembership: vi.fn(),
  normalizeTeamRole: vi.fn(),
}));

vi.mock("@functions/api/utils/session", () => ({
  getSessionUserId: sessionMocks.getSessionUserId,
}));

vi.mock("@functions/api/utils/entitlements", () => ({
  getEntitlementsForContext: entitlementsMocks.getEntitlementsForContext,
  getEntitlementsForUser: entitlementsMocks.getEntitlementsForUser,
}));

vi.mock("@functions/api/utils/stripe-subscriptions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@functions/api/utils/stripe-subscriptions")>()),
  getPersonalSubscriptionSummary: subscriptionMocks.getPersonalSubscriptionSummary,
}));

vi.mock("@functions/api/utils/team-access", () => ({
  canViewTeam: teamAccessMocks.canViewTeam,
  getActiveTeamMembership: teamAccessMocks.getActiveTeamMembership,
  normalizeTeamRole: teamAccessMocks.normalizeTeamRole,
}));

import { handleBilling } from "@functions/api/handlers/billing";

const mockEnv = {
  DB: {} as D1Database,
  BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!",
} as const;

describe("Billing handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
    entitlementsMocks.getEntitlementsForUser.mockResolvedValue({
      plan: "free",
      limits: { maxTemplates: 1, maxActiveRuns: 3 },
    });
    entitlementsMocks.getEntitlementsForContext.mockResolvedValue({
      plan: "team",
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    subscriptionMocks.getPersonalSubscriptionSummary.mockResolvedValue({ openStatus: null, hasCustomer: false });
    teamAccessMocks.getActiveTeamMembership.mockResolvedValue({
      id: "member-1",
      role: "viewer",
      status: "active",
    });
    teamAccessMocks.normalizeTeamRole.mockImplementation((role) => role);
    teamAccessMocks.canViewTeam.mockReturnValue(true);
  });

  it("GET /api/billing/status reports billing disabled when Stripe is not configured", async () => {
    const request = new Request("http://localhost/api/billing/status");
    const response = await handleBilling(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.plan).toBe("free");
    expect(data.billingEnabled).toBe(false);
  });

  it("GET /api/billing/status reports billing enabled when checkout config exists without webhook config", async () => {
    const request = new Request("http://localhost/api/billing/status");
    const response = await handleBilling(request, {
      ...mockEnv,
      STRIPE_SECRET_KEY: "sk_live_example",
      STRIPE_PRO_PRICE_ID: "price_live_example",
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.plan).toBe("free");
    expect(data.billingEnabled).toBe(true);
  });

  it("GET /api/billing/status can report team-scoped entitlements", async () => {
    const request = new Request("http://localhost/api/billing/status?teamId=team-1");
    const response = await handleBilling(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.plan).toBe("team");
    expect(teamAccessMocks.getActiveTeamMembership).toHaveBeenCalledWith(
      mockEnv,
      "team-1",
      "user-1",
    );
    expect(entitlementsMocks.getEntitlementsForContext).toHaveBeenCalledWith(
      mockEnv,
      { type: "team", teamId: "team-1", userId: "user-1" },
    );
  });

  it("GET /api/billing/status rejects unknown team contexts", async () => {
    teamAccessMocks.getActiveTeamMembership.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/billing/status?teamId=team-1");
    const response = await handleBilling(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Organization not found");
    expect(entitlementsMocks.getEntitlementsForContext).not.toHaveBeenCalled();
  });

  it("POST /api/billing/checkout returns 503 when Stripe is not configured", async () => {
    const request = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await handleBilling(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.code).toBe("billing_unavailable");
  });

  it("POST /api/billing/checkout rejects users who already have Pro", async () => {
    entitlementsMocks.getEntitlementsForUser.mockResolvedValueOnce({
      plan: "pro",
      source: "user_subscription",
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    const request = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await handleBilling(request, {
      ...mockEnv,
      STRIPE_SECRET_KEY: "sk_live_example",
      STRIPE_PRO_PRICE_ID: "price_live_example",
    });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("already_subscribed");
  });

  it("POST /api/billing/portal returns 503 when Stripe is not configured", async () => {
    const request = new Request("http://localhost/api/billing/portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await handleBilling(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.code).toBe("billing_unavailable");
  });
});

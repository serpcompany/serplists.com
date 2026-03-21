import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
}));

const entitlementsMocks = vi.hoisted(() => ({
  getEntitlementsForUser: vi.fn(),
}));

vi.mock("@functions/api/utils/session", () => ({
  getSessionUserId: sessionMocks.getSessionUserId,
}));

vi.mock("@functions/api/utils/entitlements", () => ({
  getEntitlementsForUser: entitlementsMocks.getEntitlementsForUser,
}));

import { handleBilling } from "@functions/api/handlers/billing";

const mockEnv = {
  DB: {} as D1Database,
  BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!",
} as const;

describe("Billing handler", () => {
  beforeEach(() => {
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
    entitlementsMocks.getEntitlementsForUser.mockResolvedValue({
      plan: "free",
      limits: { maxTemplates: 1, maxActiveRuns: 3 },
    });
  });

  it("GET /api/billing/status reports billing disabled when Stripe is not configured", async () => {
    const request = new Request("http://localhost/api/billing/status");
    const response = await handleBilling(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.plan).toBe("free");
    expect(data.billingEnabled).toBe(false);
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

import { describe, it, expect, beforeEach, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const db = {
    select: vi.fn(() => selectChain),
  };
  return { selectChain, db };
});

vi.mock("drizzle-orm/d1", () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

import { getEntitlementsForContext, getEntitlementsForUser } from "@functions/api/utils/entitlements";

describe("getEntitlementsForUser", () => {
  beforeEach(() => {
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
  });

  it("returns pro when an override exists", async () => {
    // First query is override lookup (limit(1))
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { user_id: "user-1", plan: "pro", expires_at: null, created_at: "now" },
    ]);

    const env: any = { DB: {} };
    const entitlements = await getEntitlementsForUser(env, "user-1");
    expect(entitlements.plan).toBe("pro");
    expect(entitlements.source).toBe("user_override");
    expect(entitlements.limits.maxTemplates).toBeNull();
  });

  it("defaults to free when no Stripe config and no override", async () => {
    const env: any = { DB: {} };
    const entitlements = await getEntitlementsForUser(env, "user-1");
    expect(entitlements.plan).toBe("free");
    expect(entitlements.source).toBe("free");
    expect(entitlements.limits.maxTemplates).toBe(1);
    expect(entitlements.limits.maxActiveRuns).toBe(3);
  });

  it("defaults to free when entitlement override table is not migrated yet", async () => {
    dbMocks.selectChain.limit.mockRejectedValueOnce(
      new Error("D1_ERROR: no such table: entitlement_overrides"),
    );
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { email: "new-user@example.com" },
    ]);

    const env: any = { DB: {} };
    const entitlements = await getEntitlementsForUser(env, "user-1");

    expect(entitlements.plan).toBe("free");
    expect(entitlements.limits.maxTemplates).toBe(1);
  });

  it("resolves user context through the existing user entitlement path", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { user_id: "user-1", plan: "pro", expires_at: null, created_at: "now" },
    ]);

    const env: any = { DB: {} };
    const entitlements = await getEntitlementsForContext(env, { type: "user", userId: "user-1" });

    expect(entitlements.plan).toBe("pro");
    expect(entitlements.source).toBe("user_override");
  });

  it("resolves premium team context from a team override without upgrading the user", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { team_id: "team-1", plan: "team", expires_at: null, created_at: "now" },
    ]);

    const env: any = { DB: {} };
    const entitlements = await getEntitlementsForContext(env, { type: "team", teamId: "team-1", userId: "user-1" });

    expect(entitlements.plan).toBe("team");
    expect(entitlements.source).toBe("team_override");
    expect(entitlements.limits.maxTemplates).toBeNull();
  });
});

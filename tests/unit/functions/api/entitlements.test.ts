import { describe, it, expect, beforeEach } from "vitest";
import { dbMocks } from "../../../support/mockedDrizzleD1";
import { chainSelectsUpdatesAndDeletes } from "../../../support/drizzleChainMocks";

import { getEntitlementsForContext, getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { apiEnv } from "../../../support/apiEnv";

function theOverrideLookupFinds(row: Record<string, unknown>) {
  dbMocks.selectChain.limit.mockResolvedValueOnce([row]);
}

describe("getEntitlementsForUser", () => {
  beforeEach(() => {
    chainSelectsUpdatesAndDeletes(dbMocks);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
  });

  it("returns pro when an override exists", async () => {
    theOverrideLookupFinds({ user_id: "user-1", plan: "pro", expires_at: null, created_at: "now" });

    const env = apiEnv();
    const entitlements = await getEntitlementsForUser(env, "user-1");
    expect(entitlements.plan).toBe("pro");
    expect(entitlements.source).toBe("user_override");
    expect(entitlements.limits.maxTemplates).toBeNull();
  });

  it("defaults to free when no Stripe config and no override", async () => {
    const env = apiEnv();
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

    const env = apiEnv();
    const entitlements = await getEntitlementsForUser(env, "user-1");

    expect(entitlements.plan).toBe("free");
    expect(entitlements.limits.maxTemplates).toBe(1);
  });

  it("resolves user context through the existing user entitlement path", async () => {
    theOverrideLookupFinds({ user_id: "user-1", plan: "pro", expires_at: null, created_at: "now" });

    const env = apiEnv();
    const entitlements = await getEntitlementsForContext(env, { type: "user", userId: "user-1" });

    expect(entitlements.plan).toBe("pro");
    expect(entitlements.source).toBe("user_override");
  });

  it("resolves premium team context from a team override without upgrading the user", async () => {
    theOverrideLookupFinds({ team_id: "team-1", plan: "team", expires_at: null, created_at: "now" });

    const env = apiEnv();
    const entitlements = await getEntitlementsForContext(env, { type: "team", teamId: "team-1", userId: "user-1" });

    expect(entitlements.plan).toBe("team");
    expect(entitlements.source).toBe("team_override");
    expect(entitlements.limits.maxTemplates).toBeNull();
  });
});

describe("entitlements in a database the billing tables have not reached yet", () => {
  const withStripe = () => apiEnv({ STRIPE_SECRET_KEY: "sk_test_entitlements", STRIPE_PRO_PRICE_ID: "price_pro" });
  const locked = new Error("D1_ERROR: database is locked");

  beforeEach(() => {
    chainSelectsUpdatesAndDeletes(dbMocks);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
  });

  it("passes on a failed override lookup that is not a missing table", async () => {
    dbMocks.selectChain.limit.mockRejectedValueOnce(locked);

    await expect(getEntitlementsForUser(apiEnv(), "user-1")).rejects.toBe(locked);
  });

  it("defaults to free when the Stripe subscriptions table is missing", async () => {
    dbMocks.selectChain.orderBy.mockRejectedValueOnce("D1_ERROR: no such table: stripe_subscriptions");

    expect(await getEntitlementsForUser(withStripe(), "user-1")).toMatchObject({ plan: "free", source: "free" });
  });

  it("passes on a failed subscription lookup that is not a missing table", async () => {
    dbMocks.selectChain.orderBy.mockRejectedValueOnce(locked);

    await expect(getEntitlementsForUser(withStripe(), "user-1")).rejects.toBe(locked);
  });

  it("defaults an Organization to free when the Organization override table is missing", async () => {
    dbMocks.selectChain.limit.mockRejectedValueOnce(new Error("D1_ERROR: no such table: team_entitlement_overrides"));

    expect(await getEntitlementsForContext(apiEnv(), { type: "team", teamId: "team-1", userId: "user-1" }))
      .toMatchObject({ plan: "free", source: "free" });
  });

  it("passes on a failed Organization override lookup that is not a missing table", async () => {
    dbMocks.selectChain.limit.mockRejectedValueOnce(locked);

    await expect(getEntitlementsForContext(apiEnv(), { type: "team", teamId: "team-1", userId: "user-1" })).rejects.toBe(locked);
  });
});

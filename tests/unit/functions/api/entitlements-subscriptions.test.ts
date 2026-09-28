import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { billingSchemaSql, createSqliteD1, type SqliteD1 } from "./support/sqlite-d1";

// Resolves plans from stored Stripe subscription rows on real SQLite.

const USER_ID = "user-1";
const PRO_PRICE_ID = "price_pro";

let d1: SqliteD1;

function env(overrides: Record<string, unknown> = {}) {
  return {
    DB: d1.binding,
    STRIPE_SECRET_KEY: "sk_test_entitlements",
    STRIPE_PRO_PRICE_ID: PRO_PRICE_ID,
    ...overrides,
  } as never;
}

function insertOverride(plan: string, expiresAt: number | null = null) {
  d1.sqlite.prepare(`
    INSERT INTO entitlement_overrides (user_id, plan, expires_at, created_at) VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z')
  `).run(USER_ID, plan, expiresAt);
}

function insertSubscription(id: string, status: string, priceId = PRO_PRICE_ID) {
  d1.sqlite.prepare(`
    INSERT INTO stripe_subscriptions (
      stripe_subscription_id, user_id, stripe_customer_id, price_id, status, created_at, updated_at
    ) VALUES (?, ?, 'cus_1', ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run(id, USER_ID, priceId, status);
}

beforeEach(() => {
  d1 = createSqliteD1(billingSchemaSql());
  d1.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(USER_ID, "user-1@example.test");
});

afterEach(() => {
  d1.close();
});

describe("getEntitlementsForUser from Stripe subscriptions", () => {
  // Which statuses grant Pro is a product decision (see pricing-and-entitlements.md):
  // change this table deliberately, never as a side effect.
  it.each([
    ["active", "pro"],
    ["trialing", "pro"],
    ["past_due", "free"],
    ["unpaid", "free"],
    ["paused", "free"],
    ["incomplete", "free"],
    ["incomplete_expired", "free"],
    ["canceled", "free"],
  ])("resolves a %s subscription to %s", async (status, plan) => {
    insertSubscription("sub_1", status);

    const entitlements = await getEntitlementsForUser(env(), USER_ID);

    expect(entitlements.plan).toBe(plan);
    expect(entitlements.source).toBe(plan === "pro" ? "user_subscription" : "free");
  });

  it("grants Pro when any subscription is active, even with a newer canceled one", async () => {
    insertSubscription("sub_active", "active");
    insertSubscription("sub_canceled", "canceled");

    expect((await getEntitlementsForUser(env(), USER_ID)).plan).toBe("pro");
  });
});

describe("getEntitlementsForUser with a manual override", () => {
  it("keeps a Free override visible as an override, even over an active subscription", async () => {
    insertOverride("free");
    insertSubscription("sub_1", "active");

    const entitlements = await getEntitlementsForUser(env(), USER_ID);

    expect(entitlements).toEqual({
      plan: "free",
      source: "user_override",
      limits: { maxTemplates: 1, maxActiveRuns: 3 },
    });
  });

  it("ignores an expired override", async () => {
    insertOverride("free", Math.floor(Date.now() / 1000) - 60);
    insertSubscription("sub_1", "active");

    const entitlements = await getEntitlementsForUser(env(), USER_ID);

    expect(entitlements.plan).toBe("pro");
    expect(entitlements.source).toBe("user_subscription");
  });
});

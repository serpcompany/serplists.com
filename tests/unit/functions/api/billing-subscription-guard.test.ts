import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingSchemaSql, createSqliteD1, type SqliteD1 } from "./support/sqlite-d1";

// Runs the billing handler and the real entitlement resolution against SQLite, so the
// checkout guard is checked against stored Stripe subscription rows.

const sessionMocks = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
const teamAccessMocks = vi.hoisted(() => ({
  canViewTeam: vi.fn(() => true),
  getActiveTeamMembership: vi.fn(async () => ({ id: "member-1", role: "viewer", status: "active" })),
  normalizeTeamRole: vi.fn((role: string) => role),
}));

vi.mock("@functions/api/utils/session", () => ({ getSessionUserId: sessionMocks.getSessionUserId }));
vi.mock("@functions/api/utils/team-access", () => teamAccessMocks);

import { handleBilling } from "@functions/api/handlers/billing";

const USER_ID = "user-1";
const PRO_PRICE_ID = "price_pro";

let d1: SqliteD1;
let fetchMock: ReturnType<typeof vi.fn>;

function env() {
  return {
    DB: d1.binding,
    BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!",
    STRIPE_SECRET_KEY: "sk_test_guard",
    STRIPE_PRO_PRICE_ID: PRO_PRICE_ID,
  } as never;
}

function insertSubscription(id: string, status: string, priceId = PRO_PRICE_ID) {
  d1.sqlite.prepare(`
    INSERT INTO stripe_subscriptions (
      stripe_subscription_id, user_id, stripe_customer_id, price_id, status, created_at, updated_at
    ) VALUES (?, ?, 'cus_1', ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run(id, USER_ID, priceId, status);
}

function insertOverride(plan: string, expiresAt: number | null = null) {
  d1.sqlite.prepare(`
    INSERT INTO entitlement_overrides (user_id, plan, expires_at, created_at) VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z')
  `).run(USER_ID, plan, expiresAt);
}

async function checkout(): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await handleBilling(
    new Request("http://localhost/api/billing/checkout", { method: "POST", body: "{}" }),
    env(),
  );
  return { status: response.status, body: await response.json() };
}

async function billingStatus(query = ""): Promise<Record<string, unknown>> {
  const response = await handleBilling(new Request(`http://localhost/api/billing/status${query}`), env());
  expect(response.status).toBe(200);
  return response.json();
}

function stripeCalls(): string[] {
  return fetchMock.mock.calls.map(([url]) => String(url));
}

beforeEach(() => {
  d1 = createSqliteD1(billingSchemaSql());
  d1.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(USER_ID, "user-1@example.test");
  d1.sqlite.prepare(`
    INSERT INTO stripe_customers (user_id, stripe_customer_id, created_at) VALUES (?, 'cus_1', '2026-01-01T00:00:00.000Z')
  `).run(USER_ID);
  sessionMocks.getSessionUserId.mockResolvedValue(USER_ID);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" })));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  d1.close();
});

describe("POST /api/billing/checkout with an existing Stripe subscription", () => {
  it.each(["past_due", "unpaid", "paused", "incomplete"])(
    "returns 409 subscription_needs_attention for a %s subscription and never calls Stripe",
    async (status) => {
      insertSubscription("sub_1", status);

      const result = await checkout();

      expect(result.status).toBe(409);
      expect(result.body.code).toBe("subscription_needs_attention");
      expect(stripeCalls()).toEqual([]);
    },
  );

  it("returns 409 already_subscribed for an active subscription on a listed legacy price", async () => {
    insertSubscription("sub_1", "active", "price_old");

    const response = await handleBilling(
      new Request("http://localhost/api/billing/checkout", { method: "POST", body: "{}" }),
      { ...(env() as object), STRIPE_PRO_LEGACY_PRICE_IDS: "price_old" } as never,
    );

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("already_subscribed");
    expect(stripeCalls()).toEqual([]);
  });

  it.each(["active", "trialing"])(
    "returns 409 already_subscribed for a %s subscription on another price",
    async (status) => {
      insertSubscription("sub_1", status, "price_other");

      const result = await checkout();

      expect(result.status).toBe(409);
      expect(result.body.code).toBe("already_subscribed");
      expect(stripeCalls()).toEqual([]);
    },
  );

  it("checks every row, not only the most recent one", async () => {
    insertSubscription("sub_old", "canceled");
    insertSubscription("sub_new", "past_due");

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("subscription_needs_attention");
  });

  it.each(["canceled", "incomplete_expired"])("allows checkout after a %s subscription", async (status) => {
    insertSubscription("sub_1", status);

    const result = await checkout();

    expect(result.status).toBe(200);
    expect(stripeCalls()).toEqual(["https://api.stripe.com/v1/checkout/sessions"]);
  });

  it("allows checkout with no subscription", async () => {
    const result = await checkout();

    expect(result.status).toBe(200);
    expect(stripeCalls()).toEqual(["https://api.stripe.com/v1/checkout/sessions"]);
  });
});

describe("GET /api/billing/status subscription details", () => {
  it("reports a subscription that needs attention and the portal for Personal", async () => {
    insertSubscription("sub_1", "past_due");

    const data = await billingStatus();

    expect(data.plan).toBe("free");
    expect(data.subscriptionStatus).toBe("past_due");
    expect(data.canManageBilling).toBe(true);
  });

  it("reports no open subscription after cancellation", async () => {
    insertSubscription("sub_1", "canceled");

    const data = await billingStatus();

    expect(data.subscriptionStatus).toBeNull();
    expect(data.canManageBilling).toBe(true);
  });

  it("never exposes Personal subscription details in an Organization context", async () => {
    insertSubscription("sub_1", "past_due");

    const data = await billingStatus("?teamId=team-1");

    expect(data).not.toHaveProperty("subscriptionStatus");
    expect(data).not.toHaveProperty("canManageBilling");
  });
});

describe("billing for a user whose plan support manages", () => {
  it("refuses checkout under a Free override before creating a Stripe customer or session", async () => {
    d1.sqlite.exec("DELETE FROM stripe_customers");
    insertOverride("free");

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("plan_managed_by_support");
    expect(stripeCalls()).toEqual([]);
    expect(d1.rows("SELECT * FROM stripe_customers")).toEqual([]);
  });

  it("keeps refusing a Pro override as already subscribed", async () => {
    insertOverride("pro");

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("already_subscribed");
    expect(stripeCalls()).toEqual([]);
  });

  it("allows checkout again once the override expires", async () => {
    insertOverride("free", Math.floor(Date.now() / 1000) - 60);

    const result = await checkout();

    expect(result.status).toBe(200);
    expect(stripeCalls()).toEqual(["https://api.stripe.com/v1/checkout/sessions"]);
  });

  it("reports the managed plan and keeps the portal for an existing customer", async () => {
    insertOverride("free");
    insertSubscription("sub_1", "active");

    const data = await billingStatus();

    expect(data.plan).toBe("free");
    expect(data.managedBySupport).toBe(true);
    expect(data.canManageBilling).toBe(true);
  });

  it("reports self-serve billing without an override", async () => {
    const data = await billingStatus();

    expect(data.managedBySupport).toBe(false);
  });
});

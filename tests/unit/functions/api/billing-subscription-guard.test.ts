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
/** What Stripe's GET /v1/subscriptions?customer=... returns; null makes it fail. */
let stripeSubscriptions: { data: unknown[]; has_more: boolean } | null;

function stripeSubscription(id: string, status: string, priceId = PRO_PRICE_ID) {
  return {
    id,
    object: "subscription",
    customer: "cus_1",
    status,
    cancel_at_period_end: false,
    canceled_at: null,
    trial_end: null,
    metadata: { userId: USER_ID },
    items: { data: [{ current_period_end: 1_900_000_000, price: { id: priceId } }] },
  };
}

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

const LIST_OPEN_SESSIONS = "GET https://api.stripe.com/v1/checkout/sessions?customer=cus_1&status=open&limit=100";
const LIST_SUBSCRIPTIONS = "GET https://api.stripe.com/v1/subscriptions?customer=cus_1&limit=100";
const CREATE_SESSION = "POST https://api.stripe.com/v1/checkout/sessions";

function stripeCalls(): string[] {
  return fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${String(url)}`);
}

function storedSubscriptionStatuses(): string[] {
  return d1.rows<{ status: string }>("SELECT status FROM stripe_subscriptions ORDER BY stripe_subscription_id").map(
    (row) => row.status,
  );
}

beforeEach(() => {
  d1 = createSqliteD1(billingSchemaSql());
  d1.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(USER_ID, "user-1@example.test");
  d1.sqlite.prepare(`
    INSERT INTO stripe_customers (user_id, stripe_customer_id, created_at) VALUES (?, 'cus_1', '2026-01-01T00:00:00.000Z')
  `).run(USER_ID);
  sessionMocks.getSessionUserId.mockResolvedValue(USER_ID);
  stripeSubscriptions = { data: [], has_more: false };
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET") === "GET" && url.startsWith("https://api.stripe.com/v1/subscriptions?")) {
      if (!stripeSubscriptions) {
        return new Response(JSON.stringify({ error: { type: "api_error" } }), { status: 500 });
      }
      return new Response(JSON.stringify({ object: "list", ...stripeSubscriptions }));
    }
    if ((init?.method ?? "GET") === "GET" && url.startsWith("https://api.stripe.com/v1/checkout/sessions?")) {
      return new Response(JSON.stringify({ object: "list", data: [], has_more: false }));
    }
    if (url === "https://api.stripe.com/v1/customers") return new Response(JSON.stringify({ id: "cus_new" }));
    return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" }));
  });
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
    expect(stripeCalls()).toEqual([LIST_OPEN_SESSIONS, LIST_SUBSCRIPTIONS, CREATE_SESSION]);
  });

  it("allows checkout with no subscription", async () => {
    const result = await checkout();

    expect(result.status).toBe(200);
    expect(stripeCalls()).toEqual([LIST_OPEN_SESSIONS, LIST_SUBSCRIPTIONS, CREATE_SESSION]);
  });
});

describe("POST /api/billing/checkout when Stripe knows a subscription D1 does not", () => {
  // Webhooks can lag or fail, so D1 alone cannot prove the customer has no subscription.

  it("returns 409 already_subscribed for an active subscription and stores it so Pro shows", async () => {
    stripeSubscriptions = { data: [stripeSubscription("sub_paid", "active")], has_more: false };

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("already_subscribed");
    expect(stripeCalls()).toEqual([LIST_OPEN_SESSIONS, LIST_SUBSCRIPTIONS]);
    expect(storedSubscriptionStatuses()).toEqual(["active"]);
    expect((await billingStatus()).plan).toBe("pro");
  });

  it.each(["trialing", "active"])("blocks a %s subscription on another price", async (status) => {
    stripeSubscriptions = { data: [stripeSubscription("sub_other", status, "price_other")], has_more: false };

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("already_subscribed");
    expect(stripeCalls()).not.toContain(CREATE_SESSION);
  });

  it.each(["past_due", "unpaid", "paused", "incomplete"])(
    "returns 409 subscription_needs_attention for a %s subscription",
    async (status) => {
      stripeSubscriptions = { data: [stripeSubscription("sub_open", status)], has_more: false };

      const result = await checkout();

      expect(result.status).toBe(409);
      expect(result.body.code).toBe("subscription_needs_attention");
      expect(stripeCalls()).not.toContain(CREATE_SESSION);
      expect((await billingStatus()).subscriptionStatus).toBe(status);
    },
  );

  it("allows checkout when Stripe's subscriptions have all ended", async () => {
    stripeSubscriptions = { data: [stripeSubscription("sub_expired", "incomplete_expired")], has_more: false };

    const result = await checkout();

    expect(result.status).toBe(200);
    expect(stripeCalls()).toEqual([LIST_OPEN_SESSIONS, LIST_SUBSCRIPTIONS, CREATE_SESSION]);
  });

  it("fails closed with 503 when Stripe cannot list the subscriptions", async () => {
    stripeSubscriptions = null;

    const result = await checkout();

    expect(result.status).toBe(503);
    expect(result.body.code).toBe("billing_unavailable");
    expect(stripeCalls()).toEqual([LIST_OPEN_SESSIONS, LIST_SUBSCRIPTIONS]);
  });

  it("fails closed when the list is incomplete and shows nothing open", async () => {
    stripeSubscriptions = { data: [stripeSubscription("sub_expired", "incomplete_expired")], has_more: true };

    const result = await checkout();

    expect(result.status).toBe(503);
    expect(stripeCalls()).not.toContain(CREATE_SESSION);
  });

  it("skips the lookup for a user who has no Stripe customer yet", async () => {
    d1.sqlite.exec("DELETE FROM stripe_customers");

    const result = await checkout();

    expect(result.status).toBe(200);
    expect(stripeCalls()).toEqual(["POST https://api.stripe.com/v1/customers", CREATE_SESSION]);
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
    expect(stripeCalls()).toEqual([LIST_OPEN_SESSIONS, LIST_SUBSCRIPTIONS, CREATE_SESSION]);
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

  it("reports no portal for a Pro override without a Stripe customer", async () => {
    d1.sqlite.exec("DELETE FROM stripe_customers");
    insertOverride("pro");

    const data = await billingStatus();

    expect(data.plan).toBe("pro");
    expect(data.managedBySupport).toBe(true);
    expect(data.canManageBilling).toBe(false);
  });

  it("refuses the portal with a code the client can explain when there is no Stripe customer", async () => {
    d1.sqlite.exec("DELETE FROM stripe_customers");
    insertOverride("pro");

    const response = await handleBilling(
      new Request("http://localhost/api/billing/portal", { method: "POST", body: "{}" }),
      env(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("no_billing_account");
    expect(body.error).not.toMatch(/Stripe customer/);
    expect(stripeCalls()).toEqual([]);
  });
});

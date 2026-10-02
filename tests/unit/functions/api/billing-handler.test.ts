import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const sessionMocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
}));

const entitlementsMocks = vi.hoisted(() => ({
  getEntitlementsForContext: vi.fn(),
  getEntitlementsForUser: vi.fn(),
}));

const subscriptionMocks = vi.hoisted(() => ({
  getPersonalSubscriptionSummary: vi.fn(),
  listOpenStoredSubscriptions: vi.fn(),
}));

const teamAccessMocks = vi.hoisted(() => ({
  canViewTeam: vi.fn(),
  getActiveTeamMembership: vi.fn(),
}));

type CustomerRow = { user_id: string; stripe_customer_id: string; created_at?: string; updated_at?: string };

const fakeStripeCustomersTable = vi.hoisted(() => ({
  mapping: null as null | CustomerRow,
  rowAnotherRequestInsertsAfterTheFirstRead: null as null | CustomerRow,
}));

vi.mock("@functions/api/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@functions/api/db")>();
  const { stripeCustomers, users } = original.schema;
  const insertRow = (row: CustomerRow, onConflict: "fail" | "ignore") => {
    if (fakeStripeCustomersTable.mapping) {
      if (onConflict === "ignore") return Promise.resolve();
      return Promise.reject(new Error("D1_ERROR: UNIQUE constraint failed: stripe_customers.user_id"));
    }
    fakeStripeCustomersTable.mapping = row;
    return Promise.resolve();
  };
  const fakeDb = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === users) return [{ email: "user@example.com" }];
            if (table !== stripeCustomers) throw new Error("unexpected table");
            const wholeRowsWithTheCustomerIdProjection = fakeStripeCustomersTable.mapping
              ? [{ ...fakeStripeCustomersTable.mapping, stripeCustomerId: fakeStripeCustomersTable.mapping.stripe_customer_id }]
              : [];
            if (fakeStripeCustomersTable.rowAnotherRequestInsertsAfterTheFirstRead) {
              fakeStripeCustomersTable.mapping = fakeStripeCustomersTable.rowAnotherRequestInsertsAfterTheFirstRead;
              fakeStripeCustomersTable.rowAnotherRequestInsertsAfterTheFirstRead = null;
            }
            return wholeRowsWithTheCustomerIdProjection;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (row: CustomerRow) => ({
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          insertRow(row, "fail").then(resolve, reject),
        onConflictDoNothing: () => insertRow(row, "ignore"),
      }),
    }),
    update: () => ({
      set: (values: Partial<CustomerRow>) => ({
        where: async () => {
          if (fakeStripeCustomersTable.mapping) fakeStripeCustomersTable.mapping = { ...fakeStripeCustomersTable.mapping, ...values };
        },
      }),
    }),
  };
  return { ...original, createDb: () => fakeDb };
});

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
  listOpenStoredSubscriptions: subscriptionMocks.listOpenStoredSubscriptions,
}));

vi.mock("@functions/api/utils/team-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@functions/api/utils/team-access")>()),
  canViewTeam: teamAccessMocks.canViewTeam,
  getActiveTeamMembership: teamAccessMocks.getActiveTeamMembership,
}));

import { handleBilling } from "@functions/api/handlers/billing";
import { apiEnv } from "../../../support/apiEnv";
import { emptyStripeList } from "../../../support/billingCheckout";
import { apiErrorBody, readJson } from "../../../support/readJson";

const mockEnv = apiEnv({ BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!" });

const billingStatusBody = z.object({ plan: z.string(), billingEnabled: z.boolean() }).passthrough();

const stripeEnv = {
  ...mockEnv,
  STRIPE_SECRET_KEY: "sk_test_example",
  STRIPE_PRO_PRICE_ID: "price_test_example",
};

function postBilling(path: "checkout" | "portal") {
  return new Request(`http://localhost/api/billing/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

type StripeCall = { path: string; idempotencyKey: string | null; body: URLSearchParams };

function stubStripeCreatingACustomerPerNewIdempotencyKey() {
  const calls: StripeCall[] = [];
  const customersByKey = new Map<string, string>();
  let createdCustomers = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname;
      const idempotencyKey = new Headers(init?.headers).get("Idempotency-Key");
      const body = new URLSearchParams(String(init?.body ?? ""));
      calls.push({ path, idempotencyKey, body });
      if ((init?.method ?? "GET") === "GET") {
        if (path === "/v1/checkout/sessions" || path === "/v1/subscriptions") return emptyStripeList();
        return new Response("not found", { status: 404 });
      }
      if (path === "/v1/customers") {
        let id = idempotencyKey ? customersByKey.get(idempotencyKey) : undefined;
        if (!id) {
          createdCustomers += 1;
          id = `cus_${createdCustomers}`;
        }
        if (idempotencyKey) customersByKey.set(idempotencyKey, id);
        return Response.json({ id });
      }
      if (path === "/v1/checkout/sessions") {
        return Response.json({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
      }
      if (path === "/v1/billing_portal/sessions") {
        return Response.json({ id: "bps_1", url: "https://billing.stripe.test/bps_1" });
      }
      return new Response("not found", { status: 404 });
    }),
  );
  return {
    calls,
    customerCalls: () => calls.filter((call) => call.path === "/v1/customers"),
    checkoutCustomers: () =>
      calls.filter((call) => call.path === "/v1/checkout/sessions").map((call) => call.body.get("customer")),
  };
}

describe("Billing handler", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fakeStripeCustomersTable.mapping = null;
    fakeStripeCustomersTable.rowAnotherRequestInsertsAfterTheFirstRead = null;
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
    subscriptionMocks.listOpenStoredSubscriptions.mockResolvedValue([]);
    teamAccessMocks.getActiveTeamMembership.mockResolvedValue({
      id: "member-1",
      role: "viewer",
      status: "active",
    });
    teamAccessMocks.canViewTeam.mockReturnValue(true);
  });

  it("GET /api/billing/status reports billing disabled when Stripe is not configured", async () => {
    const request = new Request("http://localhost/api/billing/status");
    const response = await handleBilling(request, mockEnv);
    const data = await readJson(response, billingStatusBody);

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
    const data = await readJson(response, billingStatusBody);

    expect(response.status).toBe(200);
    expect(data.plan).toBe("free");
    expect(data.billingEnabled).toBe(true);
  });

  it("GET /api/billing/status can report team-scoped entitlements", async () => {
    const request = new Request("http://localhost/api/billing/status?teamId=team-1");
    const response = await handleBilling(request, mockEnv);
    const data = await readJson(response, billingStatusBody);

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
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(404);
    expect(data.error).toBe("Organization not found");
    expect(entitlementsMocks.getEntitlementsForContext).not.toHaveBeenCalled();
  });

  it("POST /api/billing/checkout returns 503 when Stripe is not configured", async () => {
    const response = await handleBilling(postBilling("checkout"), mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(503);
    expect(data.code).toBe("billing_unavailable");
  });

  it("POST /api/billing/checkout rejects users who already have Pro", async () => {
    entitlementsMocks.getEntitlementsForUser.mockResolvedValueOnce({
      plan: "pro",
      source: "user_subscription",
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    const response = await handleBilling(postBilling("checkout"), {
      ...mockEnv,
      STRIPE_SECRET_KEY: "sk_live_example",
      STRIPE_PRO_PRICE_ID: "price_live_example",
    });
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe("already_subscribed");
  });

  it("POST /api/billing/portal returns 503 when Stripe is not configured", async () => {
    const response = await handleBilling(postBilling("portal"), mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(503);
    expect(data.code).toBe("billing_unavailable");
  });

  it("limits checkout and portal per account, whatever IP the requests come from, but never the status the settings pages load", async () => {
    sessionMocks.getSessionUserId.mockResolvedValue("rate-limited-user");
    const stripe = stubStripeCreatingACustomerPerNewIdempotencyKey();
    fakeStripeCustomersTable.mapping = { user_id: "rate-limited-user", stripe_customer_id: "cus_existing" };

    for (let index = 0; index < 10; index += 1) {
      const request = postBilling(index % 2 === 0 ? "portal" : "checkout");
      request.headers.set("CF-Connecting-IP", `192.0.2.${index}`);
      expect((await handleBilling(request, stripeEnv)).status).toBe(200);
    }
    const stripeCallsBefore = stripe.calls.length;

    const blocked = await handleBilling(postBilling("portal"), stripeEnv);

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await readJson(blocked, apiErrorBody)).error).toMatch(/try again/i);
    expect(stripe.calls.length).toBe(stripeCallsBefore);
    expect((await handleBilling(new Request("http://localhost/api/billing/status"), stripeEnv)).status).toBe(200);
  });

  it("does not count unauthenticated billing requests against an account", async () => {
    sessionMocks.getSessionUserId.mockResolvedValue(null);

    for (let index = 0; index < 20; index += 1) {
      expect((await handleBilling(postBilling("portal"), stripeEnv)).status).toBe(401);
    }
  });

  it("creates the Stripe customer with a per-account idempotency key ending in a digest of the email, so a changed email gets a new customer", async () => {
    sessionMocks.getSessionUserId.mockResolvedValue("first-checkout-user");
    const stripe = stubStripeCreatingACustomerPerNewIdempotencyKey();

    const response = await handleBilling(postBilling("checkout"), stripeEnv);

    expect(response.status).toBe(200);
    const keys = stripe.customerCalls().map((call) => call.idempotencyKey);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^customer-first-checkout-user-[0-9a-f]+$/);
    expect(fakeStripeCustomersTable.mapping?.stripe_customer_id).toBe("cus_1");
    expect(stripe.checkoutCustomers()).toEqual(["cus_1"]);
  });

  it("gives concurrent first checkouts the same Stripe customer", async () => {
    sessionMocks.getSessionUserId.mockResolvedValue("double-click-user");
    const stripe = stubStripeCreatingACustomerPerNewIdempotencyKey();

    const responses = await Promise.all([
      handleBilling(postBilling("checkout"), stripeEnv),
      handleBilling(postBilling("checkout"), stripeEnv),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const keys = new Set(stripe.customerCalls().map((call) => call.idempotencyKey));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toMatch(/^customer-double-click-user-/);
    expect(fakeStripeCustomersTable.mapping?.stripe_customer_id).toBe("cus_1");
    expect(stripe.checkoutCustomers()).toEqual(["cus_1", "cus_1"]);
  });

  it("keeps the stored customer when another request saved one first, and asks the user to start again since its subscriptions were not checked", async () => {
    sessionMocks.getSessionUserId.mockResolvedValue("raced-user");
    const stripe = stubStripeCreatingACustomerPerNewIdempotencyKey();
    fakeStripeCustomersTable.rowAnotherRequestInsertsAfterTheFirstRead = { user_id: "raced-user", stripe_customer_id: "cus_saved_first" };

    const response = await handleBilling(postBilling("checkout"), stripeEnv);

    expect(response.status).toBe(409);
    expect((await readJson(response, apiErrorBody)).code).toBe("checkout_in_progress");
    expect(fakeStripeCustomersTable.mapping?.stripe_customer_id).toBe("cus_saved_first");
    expect(stripe.checkoutCustomers()).toEqual([]);
  });
});

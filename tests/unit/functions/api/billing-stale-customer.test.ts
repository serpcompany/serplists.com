import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingSchemaSql, createSqliteD1, type SqliteD1 } from "./support/sqlite-d1";
import { signedWebhookRequest } from "./support/stripe-webhook";

// A stored Stripe customer can stop existing: deleted in the Stripe Dashboard, or
// created with the other mode's keys. Checkout must recover, and the portal must say so.

const sessionMocks = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
vi.mock("@functions/api/utils/session", () => ({ getSessionUserId: sessionMocks.getSessionUserId }));

import { handleBilling } from "@functions/api/handlers/billing";
import { handleStripe } from "@functions/api/handlers/stripe";
import { StripeApiError } from "@functions/api/utils/stripe";

const USER_ID = "user-1";
const WEBHOOK_SECRET = "whsec_stale";

let d1: SqliteD1;
let fetchMock: ReturnType<typeof vi.fn>;
/** How Stripe answers a subscription list for the stale customer. */
let staleListResponse: "missing" | "empty";
/** Customers Stripe reports as missing on Checkout Session and portal calls. */
let missingCustomers: Set<string>;
let sessionError: Record<string, unknown> | null;

function env() {
  return {
    DB: d1.binding,
    BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!",
    STRIPE_SECRET_KEY: "sk_test_stale",
    STRIPE_PRO_PRICE_ID: "price_pro",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  } as never;
}

function stripeError(status: number, error: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error }), { status });
}

const missingCustomer = (id: string) =>
  stripeError(400, {
    type: "invalid_request_error",
    code: "resource_missing",
    param: "customer",
    message: `No such customer: '${id}'`,
  });

type Call = { method: string; url: string; form: URLSearchParams; idempotencyKey?: string };

function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => {
    const request = init as RequestInit & { headers?: Record<string, string> };
    return {
      method: request.method ?? "GET",
      url: String(url),
      form: new URLSearchParams(String(request.body ?? "")),
      idempotencyKey: request.headers?.["Idempotency-Key"],
    };
  });
}

const sessionCalls = () =>
  calls().filter((call) => call.method === "POST" && call.url === "https://api.stripe.com/v1/checkout/sessions");
const customerCreates = () => calls().filter((call) => call.url === "https://api.stripe.com/v1/customers");

function storedCustomer(): string | undefined {
  return d1.rows<{ stripe_customer_id: string }>(
    "SELECT stripe_customer_id FROM stripe_customers WHERE user_id = ?",
    USER_ID,
  )[0]?.stripe_customer_id;
}

async function post(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await handleBilling(new Request(`http://localhost/api/billing/${path}`, { method: "POST", body: "{}" }), env());
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  d1 = createSqliteD1(billingSchemaSql());
  d1.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(USER_ID, "user-1@example.test");
  d1.sqlite.prepare(`
    INSERT INTO stripe_customers (user_id, stripe_customer_id, created_at) VALUES (?, 'cus_stale', '2026-01-01T00:00:00.000Z')
  `).run(USER_ID);
  sessionMocks.getSessionUserId.mockResolvedValue(USER_ID);
  staleListResponse = "missing";
  missingCustomers = new Set(["cus_stale"]);
  sessionError = null;

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const form = new URLSearchParams(String(init?.body ?? ""));
    if ((init?.method ?? "GET") === "GET" && url.pathname === "/v1/subscriptions") {
      const customer = url.searchParams.get("customer") ?? "";
      if (customer === "cus_stale" && staleListResponse === "missing") return missingCustomer(customer);
      return new Response(JSON.stringify({ data: [], has_more: false }));
    }
    if ((init?.method ?? "GET") === "GET" && url.pathname === "/v1/checkout/sessions") {
      const customer = url.searchParams.get("customer") ?? "";
      if (customer === "cus_stale" && staleListResponse === "missing") return missingCustomer(customer);
      return new Response(JSON.stringify({ data: [], has_more: false }));
    }
    if (url.pathname === "/v1/customers") return new Response(JSON.stringify({ id: "cus_new" }));
    if (url.pathname === "/v1/checkout/sessions") {
      if (sessionError) return stripeError(400, sessionError);
      const customer = form.get("customer") ?? "";
      if (missingCustomers.has(customer)) return missingCustomer(customer);
      return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" }));
    }
    if (url.pathname === "/v1/billing_portal/sessions") {
      const customer = form.get("customer") ?? "";
      if (missingCustomers.has(customer)) return missingCustomer(customer);
      return new Response(JSON.stringify({ id: "bps_1", url: "https://billing.stripe.test/bps_1" }));
    }
    throw new Error(`Unexpected Stripe call: ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  d1.close();
});

describe("checkout with a Stripe customer that no longer exists", () => {
  it("replaces a customer from the other Stripe mode and opens Checkout", async () => {
    const result = await post("checkout");

    expect(result.status).toBe(200);
    expect(result.body.url).toBe("https://checkout.stripe.test/cs_1");
    expect(customerCreates()).toHaveLength(1);
    expect(customerCreates()[0].form.get("metadata[userId]")).toBe(USER_ID);
    // A double click during the repair reuses the same new customer.
    expect(customerCreates()[0].idempotencyKey).toContain("cus_stale");
    expect(storedCustomer()).toBe("cus_new");
    expect(sessionCalls().map((call) => call.form.get("customer"))).toEqual(["cus_new"]);
  });

  it("replaces a deleted customer when Checkout rejects it, retrying once with a new idempotency key", async () => {
    staleListResponse = "empty";

    const result = await post("checkout");

    expect(result.status).toBe(200);
    expect(storedCustomer()).toBe("cus_new");
    const [first, retry] = sessionCalls();
    expect(sessionCalls()).toHaveLength(2);
    expect(first.form.get("customer")).toBe("cus_stale");
    expect(retry.form.get("customer")).toBe("cus_new");
    expect(retry.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("does not loop when the new customer is rejected too", async () => {
    staleListResponse = "empty";
    missingCustomers.add("cus_new");

    await expect(post("checkout")).rejects.toBeInstanceOf(StripeApiError);
    expect(sessionCalls()).toHaveLength(2);
    expect(customerCreates()).toHaveLength(1);
  });

  it("never replaces the customer for other Stripe errors", async () => {
    staleListResponse = "empty";
    missingCustomers.clear();
    sessionError = { type: "invalid_request_error", code: "resource_missing", param: "line_items[0][price]" };

    await expect(post("checkout")).rejects.toBeInstanceOf(StripeApiError);
    expect(customerCreates()).toEqual([]);
    expect(storedCustomer()).toBe("cus_stale");
  });
});

describe("the Customer Portal with a Stripe customer that no longer exists", () => {
  it("returns 409 billing_customer_missing instead of a server error", async () => {
    const result = await post("portal");

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("billing_customer_missing");
    expect(customerCreates()).toEqual([]);
  });
});

describe("webhooks after a customer was replaced", () => {
  it("does not map the user back to the old customer when its subscription ends", async () => {
    d1.sqlite.prepare("UPDATE stripe_customers SET stripe_customer_id = 'cus_new' WHERE user_id = ?").run(USER_ID);
    const subscription = {
      id: "sub_old",
      customer: "cus_stale",
      status: "canceled",
      canceled_at: 1_800_000_000,
      metadata: { userId: USER_ID },
      items: { data: [{ current_period_end: 1_800_000_000, price: { id: "price_pro" } }] },
    };
    const event = {
      id: "evt_old_canceled",
      type: "customer.subscription.deleted",
      created: 123,
      livemode: false,
      data: { object: subscription },
    };

    const response = await handleStripe(await signedWebhookRequest(event, WEBHOOK_SECRET), env());

    expect(response.status).toBe(200);
    expect(storedCustomer()).toBe("cus_new");
    expect(d1.rows("SELECT status FROM stripe_subscriptions")).toEqual([{ status: "canceled" }]);
  });
});

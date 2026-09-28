import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingSchemaSql, createSqliteD1, type SqliteD1 } from "./support/sqlite-d1";

// Two first-time checkouts at once (two tabs, or a double click on an unguarded
// Upgrade button) must not create two Stripe customers, overwrite the stored mapping,
// or turn Stripe's idempotency conflicts into a server error.

const sessionMocks = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
vi.mock("@functions/api/utils/session", () => ({ getSessionUserId: sessionMocks.getSessionUserId }));

import { handleBilling } from "@functions/api/handlers/billing";

const USER_ID = "user-1";

let d1: SqliteD1;
let fetchMock: ReturnType<typeof vi.fn>;
/** Runs while Stripe creates a customer, before it answers. */
let duringCustomerCreate: (() => void) | null;

type Call = { url: string; form: URLSearchParams; idempotencyKey?: string };

/**
 * Stripe's idempotency rules: a key reused with the same parameters replays the first
 * response, a key still in flight is rejected with 409, and a key reused with other
 * parameters is rejected with 400.
 */
function createStripeMock() {
  const keys = new Map<string, { body: string; response?: string }>();
  let nextId = 0;
  const calls: Call[] = [];

  const stripeError = (status: number, error: Record<string, string>) =>
    new Response(JSON.stringify({ error }), { status });

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const idempotencyKey = headers["Idempotency-Key"];
    const body = String(init?.body ?? "");
    calls.push({ url: url.pathname, form: new URLSearchParams(body), idempotencyKey });

    if ((init?.method ?? "GET") === "GET" && url.pathname === "/v1/subscriptions") {
      return new Response(JSON.stringify({ data: [], has_more: false }));
    }

    const scopedKey = idempotencyKey ? `${url.pathname} ${idempotencyKey}` : null;
    const earlier = scopedKey ? keys.get(scopedKey) : undefined;
    if (earlier) {
      if (earlier.body !== body) {
        return stripeError(400, { type: "idempotency_error", message: "Keys can only be reused with the same parameters." });
      }
      if (!earlier.response) {
        return stripeError(409, { type: "invalid_request_error", code: "idempotency_key_in_use" });
      }
      return new Response(earlier.response);
    }
    const record: { body: string; response?: string } = { body };
    if (scopedKey) keys.set(scopedKey, record);

    // Stripe takes a moment, so a concurrent request can reach the same step.
    await new Promise((resolve) => setTimeout(resolve, 5));
    let response: string;
    if (url.pathname === "/v1/customers") {
      duringCustomerCreate?.();
      response = JSON.stringify({ id: `cus_${++nextId}` });
    } else if (url.pathname === "/v1/checkout/sessions") {
      const customer = new URLSearchParams(body).get("customer");
      response = JSON.stringify({ id: `cs_${++nextId}`, url: `https://checkout.stripe.test/${customer}` });
    } else {
      throw new Error(`Unexpected Stripe call: ${url.pathname}`);
    }
    record.response = response;
    return new Response(response);
  });

  return { fetch, calls };
}

let stripe: ReturnType<typeof createStripeMock>;

function env() {
  return {
    DB: d1.binding,
    BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!",
    STRIPE_SECRET_KEY: "sk_test_concurrency",
    STRIPE_PRO_PRICE_ID: "price_pro",
  } as never;
}

async function checkout(): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await handleBilling(
    new Request("http://localhost/api/billing/checkout", { method: "POST", body: "{}" }),
    env(),
  );
  return { status: response.status, body: await response.json() };
}

const customerCreates = () => stripe.calls.filter((call) => call.url === "/v1/customers");
const sessionCalls = () => stripe.calls.filter((call) => call.url === "/v1/checkout/sessions");

function storedCustomers(): string[] {
  return d1
    .rows<{ stripe_customer_id: string }>("SELECT stripe_customer_id FROM stripe_customers WHERE user_id = ?", USER_ID)
    .map((row) => row.stripe_customer_id);
}

beforeEach(() => {
  d1 = createSqliteD1(billingSchemaSql());
  d1.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(USER_ID, "user-1@example.test");
  sessionMocks.getSessionUserId.mockResolvedValue(USER_ID);
  duringCustomerCreate = null;
  stripe = createStripeMock();
  fetchMock = stripe.fetch;
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  d1.close();
});

describe("concurrent first-time checkouts", () => {
  it("create one Stripe customer and never send a session for a customer the mapping does not hold", async () => {
    const results = await Promise.all([checkout(), checkout()]);

    // Every request asks Stripe for the same customer.
    const keys = customerCreates().map((call) => call.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(new Set(keys).size).toBe(1);

    expect(storedCustomers()).toEqual(["cus_1"]);
    for (const call of sessionCalls()) expect(call.form.get("customer")).toBe("cus_1");

    // One request opens Checkout; the other is told to try again, never a 500.
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = results.find((result) => result.status === 409);
    expect(conflict?.body.code).toBe("checkout_in_progress");
    const opened = results.find((result) => result.status === 200);
    expect(opened?.body.url).toBe("https://checkout.stripe.test/cus_1");
  });

  it("reuses the customer and session of a request that already finished", async () => {
    const first = await checkout();
    d1.sqlite.exec("DELETE FROM stripe_customers");

    // A retry after the mapping was lost (a failed D1 write) gets the same customer back.
    const second = await checkout();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.url).toBe(first.body.url);
    expect(storedCustomers()).toEqual(["cus_1"]);
  });

  it("keeps a mapping another request stored first instead of overwriting it", async () => {
    duringCustomerCreate = () => {
      d1.sqlite.prepare(`
        INSERT INTO stripe_customers (user_id, stripe_customer_id, created_at)
        VALUES (?, 'cus_webhook', '2026-01-01T00:00:00.000Z')
      `).run(USER_ID);
    };

    const result = await checkout();

    expect(storedCustomers()).toEqual(["cus_webhook"]);
    // The stored customer was never checked for subscriptions, so the user retries.
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("checkout_in_progress");
    expect(sessionCalls()).toEqual([]);
  });
});

describe("Stripe idempotency conflicts on the Checkout Session", () => {
  it("returns 409 checkout_in_progress for a double click by a user with a customer", async () => {
    d1.sqlite.prepare(`
      INSERT INTO stripe_customers (user_id, stripe_customer_id, created_at) VALUES (?, 'cus_existing', '2026-01-01T00:00:00.000Z')
    `).run(USER_ID);

    const results = await Promise.all([checkout(), checkout()]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body.code).toBe("checkout_in_progress");
    expect(customerCreates()).toEqual([]);
  });
});

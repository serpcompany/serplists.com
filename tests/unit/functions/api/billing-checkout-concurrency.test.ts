import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  billingSchemaSql,
  emptyStripeList,
  postToBilling,
  seedBillingUser,
  stripeBillingEnv,
  stripeErrorResponse,
} from "../../../support/billingCheckout";
import { SqliteD1 } from "../../../support/sqlite-d1";

const sessionMocks = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
vi.mock("@functions/api/utils/session", () => ({ getSessionUserId: sessionMocks.getSessionUserId }));

const USER_ID = "user-1";

let d1: SqliteD1;
let fetchMock: ReturnType<typeof vi.fn>;
let runWhileStripeCreatesTheCustomer: (() => void) | null;
let pathWhereTheFirstCallWaitsForTheSecond: "/v1/customers" | "/v1/checkout/sessions" | null;

type Call = { method: string; url: string; form: URLSearchParams; idempotencyKey?: string };

function createStripeWithItsIdempotencyRules() {
  const keys = new Map<string, { body: string; response?: string }>();
  let nextId = 0;
  const calls: Call[] = [];
  let secondCallArrived = () => {};
  const secondCall = new Promise<void>((resolve) => {
    secondCallArrived = resolve;
  });

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const idempotencyKey = headers["Idempotency-Key"];
    const body = String(init?.body ?? "");
    const method = init?.method ?? "GET";
    calls.push({ method, url: url.pathname, form: new URLSearchParams(body), idempotencyKey });

    if (method === "GET" && url.pathname === "/v1/subscriptions") return emptyStripeList();
    if (method === "GET" && url.pathname === "/v1/checkout/sessions") return emptyStripeList();
    const callsToPath = calls.filter((call) => call.method === "POST" && call.url === url.pathname).length;
    if (url.pathname === pathWhereTheFirstCallWaitsForTheSecond && callsToPath === 2) secondCallArrived();

    const scopedKey = idempotencyKey ? `${url.pathname} ${idempotencyKey}` : null;
    const earlier = scopedKey ? keys.get(scopedKey) : undefined;
    if (earlier) {
      if (earlier.body !== body) {
        return stripeErrorResponse(400, { type: "idempotency_error", message: "Keys can only be reused with the same parameters." });
      }
      if (!earlier.response) {
        return stripeErrorResponse(409, { type: "invalid_request_error", code: "idempotency_key_in_use" });
      }
      return new Response(earlier.response);
    }
    const record: { body: string; response?: string } = { body };
    if (scopedKey) keys.set(scopedKey, record);

    if (url.pathname === pathWhereTheFirstCallWaitsForTheSecond && callsToPath === 1) await secondCall;
    let response: string;
    if (url.pathname === "/v1/customers") {
      runWhileStripeCreatesTheCustomer?.();
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

let stripe: ReturnType<typeof createStripeWithItsIdempotencyRules>;

const checkout = () => postToBilling(stripeBillingEnv(d1), "checkout");

const customerCreates = () => stripe.calls.filter((call) => call.url === "/v1/customers");
const sessionCalls = () => stripe.calls.filter((call) => call.method === "POST" && call.url === "/v1/checkout/sessions");

function storedCustomers(): string[] {
  return d1
    .rows<{ stripe_customer_id: string }>("SELECT stripe_customer_id FROM stripe_customers WHERE user_id = ?", USER_ID)
    .map((row) => row.stripe_customer_id);
}

beforeEach(() => {
  d1 = new SqliteD1({ schemaSql: billingSchemaSql() });
  seedBillingUser(d1, USER_ID);
  sessionMocks.getSessionUserId.mockResolvedValue(USER_ID);
  runWhileStripeCreatesTheCustomer = null;
  pathWhereTheFirstCallWaitsForTheSecond = null;
  stripe = createStripeWithItsIdempotencyRules();
  fetchMock = stripe.fetch;
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  d1.close();
});

describe("concurrent first-time checkouts, from two tabs or a double click", () => {
  it("create one Stripe customer and never send a session for a customer the mapping does not hold", async () => {
    pathWhereTheFirstCallWaitsForTheSecond = "/v1/customers";

    const results = await Promise.all([checkout(), checkout()]);

    const customerIdempotencyKeys = customerCreates().map((call) => call.idempotencyKey);
    expect(customerIdempotencyKeys).toHaveLength(2);
    expect(customerIdempotencyKeys[0]).toBeTruthy();
    expect(new Set(customerIdempotencyKeys).size).toBe(1);

    expect(storedCustomers()).toEqual(["cus_1"]);
    for (const call of sessionCalls()) expect(call.form.get("customer")).toBe("cus_1");

    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = results.find((result) => result.status === 409);
    expect(conflict?.body.code).toBe("checkout_in_progress");
    const opened = results.find((result) => result.status === 200);
    expect(opened?.body.url).toBe("https://checkout.stripe.test/cus_1");
  });

  it("reuses the customer and session of a request that already finished, even after its mapping was lost", async () => {
    const first = await checkout();
    d1.sqlite.exec("DELETE FROM stripe_customers");

    const retryAfterTheMappingWasLost = await checkout();

    expect(first.status).toBe(200);
    expect(retryAfterTheMappingWasLost.status).toBe(200);
    expect(retryAfterTheMappingWasLost.body.url).toBe(first.body.url);
    expect(storedCustomers()).toEqual(["cus_1"]);
  });

  it("keeps a mapping another request stored first instead of overwriting it, and asks for a retry since its subscriptions were not checked", async () => {
    runWhileStripeCreatesTheCustomer = () => {
      d1.sqlite.prepare(`
        INSERT INTO stripe_customers (user_id, stripe_customer_id, created_at)
        VALUES (?, 'cus_webhook', '2026-01-01T00:00:00.000Z')
      `).run(USER_ID);
    };

    const result = await checkout();

    expect(storedCustomers()).toEqual(["cus_webhook"]);
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
    pathWhereTheFirstCallWaitsForTheSecond = "/v1/checkout/sessions";

    const results = await Promise.all([checkout(), checkout()]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body.code).toBe("checkout_in_progress");
    expect(customerCreates()).toEqual([]);
  });
});

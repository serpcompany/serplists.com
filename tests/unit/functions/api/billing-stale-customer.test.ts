import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { elementAt, firstOf } from "../../../support/elements";
import { sessionMocks } from "../../../support/mockedSession";
import "../../../support/checkoutWithoutARateLimit";
import {
  billingSchemaSql,
  emptyStripeList,
  postToBilling,
  seedBillingUser,
  storeSubscriptionRow,
  stripeBillingEnv,
  stripeErrorResponse,
  stripeSubscription as stripeSubscriptionFor,
} from "../../../support/billingCheckout";
import { SqliteD1 } from "../../../support/sqlite-d1";
import { readJson } from "../../../support/readJson";
import { billingStatusSchema } from "@/lib/schemas/accountResponses";
import { signedWebhookRequest } from "./support/stripe-webhook";

import { handleBilling } from "@functions/api/handlers/billing";
import { handleStripe } from "@functions/api/handlers/stripe";
import { StripeApiError } from "@functions/api/utils/stripe";

const USER_ID = "user-1";
const WEBHOOK_SECRET = "whsec_stale";

let d1: SqliteD1;
let fetchMock: Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>;
let staleCustomerListAnswer: "missing" | "empty" | "error";
let subscriptionsStripeCanRetrieve: Map<string, Record<string, unknown>>;
let subscriptionRetrieveFails: boolean;
let customersMissingAtCheckoutAndPortal: Set<string>;
let sessionError: Record<string, unknown> | null;

const env = () => stripeBillingEnv(d1, { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET });

const missingCustomer = (id: string) =>
  stripeErrorResponse(400, {
    type: "invalid_request_error",
    code: "resource_missing",
    param: "customer",
    message: `No such customer: '${id}'`,
  });

type Call = { method: string; url: string; form: URLSearchParams; idempotencyKey: string | undefined };

function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => {
    return {
      method: init?.method ?? "GET",
      url: String(url),
      form: new URLSearchParams(String(init?.body ?? "")),
      idempotencyKey: new Headers(init?.headers).get("Idempotency-Key") ?? undefined,
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

const post = (path: "checkout" | "portal") => postToBilling(env(), path);

async function billingStatus() {
  const response = await handleBilling(new Request("http://localhost/api/billing/status"), env());
  expect(response.status).toBe(200);
  return readJson(response, billingStatusSchema.passthrough());
}

const storeSubscription = (id: string, customerId: string, status: string, priceId = "price_other_mode") =>
  storeSubscriptionRow(d1, { id, userId: USER_ID, customerId, status, priceId });

function storedSubscriptionStatuses(): Record<string, string> {
  const rows = d1.rows<{ id: string; status: string }>(
    "SELECT stripe_subscription_id AS id, status FROM stripe_subscriptions ORDER BY id",
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.status]));
}

const stripeSubscription = (id: string, customerId: string, status: string) =>
  stripeSubscriptionFor({ id, userId: USER_ID, customerId, status });

const subscriptionReads = () =>
  calls().filter((call) => call.method === "GET" && call.url.startsWith("https://api.stripe.com/v1/subscriptions/"));

beforeEach(() => {
  d1 = new SqliteD1({ schemaSql: billingSchemaSql() });
  seedBillingUser(d1, USER_ID, "cus_stale");
  sessionMocks.getSessionUserId.mockResolvedValue(USER_ID);
  staleCustomerListAnswer = "missing";
  subscriptionsStripeCanRetrieve = new Map();
  subscriptionRetrieveFails = false;
  customersMissingAtCheckoutAndPortal = new Set(["cus_stale"]);
  sessionError = null;

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const form = new URLSearchParams(String(init?.body ?? ""));
    if ((init?.method ?? "GET") === "GET" && url.pathname === "/v1/subscriptions") {
      const customer = url.searchParams.get("customer") ?? "";
      if (customer === "cus_stale" && staleCustomerListAnswer === "missing") return missingCustomer(customer);
      if (customer === "cus_stale" && staleCustomerListAnswer === "error") return stripeErrorResponse(500, { type: "api_error" });
      return emptyStripeList();
    }
    if ((init?.method ?? "GET") === "GET" && url.pathname.startsWith("/v1/subscriptions/")) {
      if (subscriptionRetrieveFails) return stripeErrorResponse(500, { type: "api_error" });
      const found = subscriptionsStripeCanRetrieve.get(decodeURIComponent(url.pathname.slice("/v1/subscriptions/".length)));
      if (found) return new Response(JSON.stringify(found));
      return stripeErrorResponse(404, { type: "invalid_request_error", code: "resource_missing", param: "id" });
    }
    if ((init?.method ?? "GET") === "GET" && url.pathname === "/v1/checkout/sessions") {
      const customer = url.searchParams.get("customer") ?? "";
      if (customer === "cus_stale" && staleCustomerListAnswer === "missing") return missingCustomer(customer);
      return emptyStripeList();
    }
    if (url.pathname === "/v1/customers") return new Response(JSON.stringify({ id: "cus_new" }));
    if (url.pathname === "/v1/checkout/sessions") {
      if (sessionError) return stripeErrorResponse(400, sessionError);
      const customer = form.get("customer") ?? "";
      if (customersMissingAtCheckoutAndPortal.has(customer)) return missingCustomer(customer);
      return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" }));
    }
    if (url.pathname === "/v1/billing_portal/sessions") {
      const customer = form.get("customer") ?? "";
      if (customersMissingAtCheckoutAndPortal.has(customer)) return missingCustomer(customer);
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
  it("replaces a customer from the other Stripe mode and opens Checkout, keying the new customer on the old so a double click reuses it", async () => {
    const result = await post("checkout");

    expect(result.status).toBe(200);
    expect(result.body.url).toBe("https://checkout.stripe.test/cs_1");
    expect(customerCreates()).toHaveLength(1);
    expect(firstOf(customerCreates()).form.get("metadata[userId]")).toBe(USER_ID);
    expect(firstOf(customerCreates()).idempotencyKey).toContain("cus_stale");
    expect(storedCustomer()).toBe("cus_new");
    expect(sessionCalls().map((call) => call.form.get("customer"))).toEqual(["cus_new"]);
  });

  it("replaces a deleted customer when Checkout rejects it, retrying once with a new idempotency key", async () => {
    staleCustomerListAnswer = "empty";

    const result = await post("checkout");

    expect(result.status).toBe(200);
    expect(storedCustomer()).toBe("cus_new");
    expect(sessionCalls()).toHaveLength(2);
    const first = firstOf(sessionCalls());
    const retry = elementAt(sessionCalls(), 1);
    expect(first.form.get("customer")).toBe("cus_stale");
    expect(retry.form.get("customer")).toBe("cus_new");
    expect(retry.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("does not loop when the new customer is rejected too", async () => {
    staleCustomerListAnswer = "empty";
    customersMissingAtCheckoutAndPortal.add("cus_new");

    await expect(post("checkout")).rejects.toBeInstanceOf(StripeApiError);
    expect(sessionCalls()).toHaveLength(2);
    expect(customerCreates()).toHaveLength(1);
  });

  it("never replaces the customer for other Stripe errors", async () => {
    staleCustomerListAnswer = "empty";
    customersMissingAtCheckoutAndPortal.clear();
    sessionError = { type: "invalid_request_error", code: "resource_missing", param: "line_items[0][price]" };

    await expect(post("checkout")).rejects.toBeInstanceOf(StripeApiError);
    expect(customerCreates()).toEqual([]);
    expect(storedCustomer()).toBe("cus_stale");
  });
});

describe("checkout with an open subscription stored for a customer Stripe no longer has, which no webhook will ever update", () => {
  it.each(["active", "past_due", "incomplete"])(
    "replaces the customer and opens Checkout past a stored %s subscription, which it leaves as it was",
    async (status) => {
      storeSubscription("sub_stale", "cus_stale", status);

      const result = await post("checkout");

      expect(result.status).toBe(200);
      expect(result.body.url).toBe("https://checkout.stripe.test/cs_1");
      expect(storedCustomer()).toBe("cus_new");
      expect(sessionCalls().map((call) => call.form.get("customer"))).toEqual(["cus_new"]);
      expect(storedSubscriptionStatuses()).toEqual({ sub_stale: status });
      expect(await billingStatus()).toMatchObject({ plan: "free", subscriptionStatus: null, canManageBilling: true });
    },
  );

  it("opens Checkout again later, after Stripe confirms it has no such subscription", async () => {
    storeSubscription("sub_stale", "cus_stale", "active");
    expect((await post("checkout")).status).toBe(200);

    const again = await post("checkout");

    expect(again.status).toBe(200);
    expect(customerCreates()).toHaveLength(1);
    expect(subscriptionReads().map((call) => call.url)).toEqual(["https://api.stripe.com/v1/subscriptions/sub_stale"]);
    expect(storedSubscriptionStatuses()).toEqual({ sub_stale: "active" });
  });

  it("still refuses a subscription Stripe has on another customer, and stores what Stripe says", async () => {
    d1.sqlite.prepare("UPDATE stripe_customers SET stripe_customer_id = 'cus_new' WHERE user_id = ?").run(USER_ID);
    storeSubscription("sub_live", "cus_live", "past_due");
    subscriptionsStripeCanRetrieve.set("sub_live", stripeSubscription("sub_live", "cus_live", "active"));

    const result = await post("checkout");

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("already_subscribed");
    expect(sessionCalls()).toEqual([]);
    expect(customerCreates()).toEqual([]);
    expect(storedSubscriptionStatuses()).toEqual({ sub_live: "active" });
  });

  it("fails closed when Stripe cannot say whether a subscription on another customer exists", async () => {
    d1.sqlite.prepare("UPDATE stripe_customers SET stripe_customer_id = 'cus_new' WHERE user_id = ?").run(USER_ID);
    storeSubscription("sub_stale", "cus_stale", "active");
    subscriptionRetrieveFails = true;

    const result = await post("checkout");

    expect(result.status).toBe(503);
    expect(result.body.code).toBe("billing_unavailable");
    expect(sessionCalls()).toEqual([]);
  });

  it("fails closed, replacing nothing, when Stripe cannot list the stored customer's subscriptions", async () => {
    storeSubscription("sub_stale", "cus_stale", "active");
    staleCustomerListAnswer = "error";

    const result = await post("checkout");

    expect(result.status).toBe(503);
    expect(customerCreates()).toEqual([]);
    expect(storedCustomer()).toBe("cus_stale");
    expect(storedSubscriptionStatuses()).toEqual({ sub_stale: "active" });
  });

  it("still refuses from stored rows alone for a user with no stored customer", async () => {
    d1.sqlite.exec("DELETE FROM stripe_customers");
    storeSubscription("sub_stale", "cus_stale", "active");

    const result = await post("checkout");

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("already_subscribed");
    expect(calls()).toEqual([]);
  });
});

describe("the Customer Portal with a Stripe customer that no longer exists", () => {
  it("returns 409 billing_customer_missing instead of a server error, and replaces the customer", async () => {
    const result = await post("portal");

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("billing_customer_missing");
    expect(customerCreates()).toHaveLength(1);
    expect(storedCustomer()).toBe("cus_new");
  });

  it("stops Billing showing the old customer's subscription, so Upgrade can open Checkout", async () => {
    storeSubscription("sub_stale", "cus_stale", "active");
    expect((await billingStatus()).subscriptionStatus).toBe("active");

    const portal = await post("portal");

    expect(portal.body.code).toBe("billing_customer_missing");
    expect(await billingStatus()).toMatchObject({ plan: "free", subscriptionStatus: null });
    const result = await post("checkout");
    expect(result.status).toBe(200);
    expect(sessionCalls().map((call) => call.form.get("customer"))).toEqual(["cus_new"]);
    expect(customerCreates()).toHaveLength(1);
  });
});

const CONTACT_SUPPORT = "Your billing account could not be found. Contact support.";

describe("a missing customer with a stored subscription on a current Pro price, which means the deployed keys are wrong, not the customer", () => {
  it("keeps the customer at the portal and says to contact support", async () => {
    storeSubscription("sub_pro", "cus_stale", "active", "price_pro");

    const portal = await post("portal");

    expect(portal.status).toBe(409);
    expect(portal.body).toMatchObject({ code: "billing_customer_missing", error: CONTACT_SUPPORT });
    expect(customerCreates()).toEqual([]);
    expect(storedCustomer()).toBe("cus_stale");
    expect(storedSubscriptionStatuses()).toEqual({ sub_pro: "active" });
    expect(await billingStatus()).toMatchObject({ plan: "pro", subscriptionStatus: "active" });
  });

  it("keeps the customer at the portal while Pro comes from a subscription on another customer", async () => {
    storeSubscription("sub_pro", "cus_live", "active", "price_pro");

    const portal = await post("portal");

    expect(portal.body).toMatchObject({ code: "billing_customer_missing", error: CONTACT_SUPPORT });
    expect(customerCreates()).toEqual([]);
    expect(storedCustomer()).toBe("cus_stale");
  });

  it("refuses checkout for a Pro subscriber, creating no customer", async () => {
    storeSubscription("sub_pro", "cus_stale", "active", "price_pro");

    const result = await post("checkout");

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("already_subscribed");
    expect(customerCreates()).toEqual([]);
    expect(storedCustomer()).toBe("cus_stale");
  });

  it.each([
    ["past_due", "subscription_needs_attention"],
    ["incomplete", "checkout_incomplete"],
  ])("refuses checkout past a stored %s subscription, creating no customer", async (status, code) => {
    storeSubscription("sub_pro", "cus_stale", status, "price_pro");

    const result = await post("checkout");

    expect(result.status).toBe(409);
    expect(result.body.code).toBe(code);
    expect(customerCreates()).toEqual([]);
    expect(sessionCalls()).toEqual([]);
    expect(storedCustomer()).toBe("cus_stale");
    expect(storedSubscriptionStatuses()).toEqual({ sub_pro: status });
  });

  it("refuses checkout when only the Checkout Session says the customer is missing", async () => {
    staleCustomerListAnswer = "empty";
    storeSubscription("sub_pro", "cus_stale", "past_due", "price_pro");

    const result = await post("checkout");

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("subscription_needs_attention");
    expect(customerCreates()).toEqual([]);
    expect(storedCustomer()).toBe("cus_stale");
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

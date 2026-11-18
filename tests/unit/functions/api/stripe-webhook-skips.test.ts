import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleStripe } from "@functions/api/handlers/stripe";
import { billingSchemaSql, seedBillingUser } from "../../../support/billingCheckout";
import { SqliteD1 } from "../../../support/sqlite-d1";
import { apiEnv, TEST_AUTH_SECRET, withoutVars } from "../../../support/apiEnv";
import { hmacSha256Hex, signedWebhookRequest } from "./support/stripe-webhook";
import { apiErrorBody, readJson } from "../../../support/readJson";
import { logLineIn } from "../../../support/storedJson";
import type { Env } from "@functions/api/types";

const SECRET = "whsec_skips";
let database: SqliteD1;
let stripeEnv: Env;

const handledEvents = () => database.rows("SELECT id, livemode, created FROM stripe_webhook_events");
const customers = () => database.rows("SELECT user_id, stripe_customer_id FROM stripe_customers");
const send = async (event: Record<string, unknown>, env = stripeEnv) => handleStripe(await signedWebhookRequest(event, SECRET), env);
const checkout = (id: string, object: Record<string, unknown>) => ({ id, type: "checkout.session.completed", data: { object } });

function rawSignedRequest(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "Stripe-Signature": `t=${timestamp},v1=${hmacSha256Hex(secret, `${timestamp}.${payload}`)}` },
    body: payload,
  });
}

function skipReasons(info: { mock: { calls: unknown[][] } }) {
  return info.mock.calls.map(([line]) => logLineIn(line)).filter((line) => line.message === "stripe_webhook_event_skipped").map((line) => line["reason"]);
}

beforeEach(() => {
  database = new SqliteD1({ schemaSql: billingSchemaSql() });
  seedBillingUser(database, "user-1");
  stripeEnv = apiEnv({ DB: database.binding, BETTER_AUTH_SECRET: TEST_AUTH_SECRET, STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: "sk_test_skips" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  database.close();
});

describe("webhook deliveries the handler refuses, recording nothing", () => {
  it.each([
    ["signed with another secret", rawSignedRequest("{}", "whsec_other"), /^Webhook signature verification failed: /],
    ["whose signed payload is not JSON", rawSignedRequest("not json", SECRET), /^Invalid JSON payload$/],
  ])("answers a delivery %s with 400", async (_label, request, error) => {
    const response = await handleStripe(request, stripeEnv);

    expect(response.status).toBe(400);
    expect((await readJson(response, apiErrorBody)).error).toMatch(error);
    expect(handledEvents()).toEqual([]);
  });

  it.each([
    ["GET", "webhook"],
    ["POST", "elsewhere"],
  ])("answers %s /api/stripe/%s with 404", async (method, path) => {
    const response = await handleStripe(new Request(`http://localhost/api/stripe/${path}`, { method }), stripeEnv);

    expect(response.status).toBe(404);
  });
});

describe("webhook events the handler marks handled without changing billing", () => {
  it("records a test-mode event with no creation time at the signature's time", async () => {
    const before = Math.floor(Date.now() / 1000);

    expect((await send({ id: "evt_plain", type: "invoice.paid", data: { object: {} } })).status).toBe(200);
    const [handled] = handledEvents();
    expect(handled).toMatchObject({ id: "evt_plain", livemode: 0 });
    expect(Number(handled?.created)).toBeGreaterThanOrEqual(before);
  });

  it.each([
    ["names no customer", checkout("evt_1", { metadata: { userId: "user-1" } }), "missing_user_or_customer"],
    ["names no user", checkout("evt_2", { customer: "cus_1" }), "missing_user_or_customer"],
  ])("skips a completed Checkout that %s", async (_label, event, reason) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    expect((await send(event)).status).toBe(200);
    expect(customers()).toEqual([]);
    expect(skipReasons(info)).toEqual([reason]);
  });

  it.each([
    ["a subscription event whose subscription cannot be read", { id: "evt_3", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } }, "invalid_subscription"],
    [
      "a subscription event for a customer nobody is mapped to and no user is named on",
      { id: "evt_4", type: "customer.subscription.updated", data: { object: { id: "sub_1", customer: "cus_9", status: "active", items: { data: [{ current_period_end: 1_800_000_000, price: { id: "price_1" } }] } } } },
      "unknown_user",
    ],
  ])("skips %s", async (_label, event, reason) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    expect((await send(event)).status).toBe(200);
    expect(database.rows("SELECT stripe_subscription_id FROM stripe_subscriptions")).toEqual([]);
    expect(skipReasons(info)).toEqual([reason]);
  });
});

describe("completed Checkouts whose subscription the handler does not read", () => {
  it("maps the customer named by client_reference_id when the session names no subscription", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    expect((await send(checkout("evt_5", { customer: "cus_1", client_reference_id: "user-1", mode: "subscription" }))).status).toBe(200);
    expect(customers()).toEqual([{ user_id: "user-1", stripe_customer_id: "cus_1" }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps the customer and skips the subscription read when no Stripe secret key is set", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const event = checkout("evt_6", { customer: "cus_1", client_reference_id: "user-1", mode: "subscription", subscription: "sub_1" });

    expect((await send(event, withoutVars(stripeEnv, ["STRIPE_SECRET_KEY"]))).status).toBe(200);
    expect(customers()).toEqual([{ user_id: "user-1", stripe_customer_id: "cus_1" }]);
    expect(skipReasons(info)).toEqual(["subscription_read_needs_secret_key"]);
  });
});

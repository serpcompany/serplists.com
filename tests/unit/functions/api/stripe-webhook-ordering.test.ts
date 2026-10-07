import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleStripe } from "@functions/api/handlers/stripe";
import { getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { billingSchemaSql, seedBillingUser } from "../../../support/billingCheckout";
import { SqliteD1 } from "../../../support/sqlite-d1";
import { apiEnv, TEST_AUTH_SECRET, withoutVars, type OptionalEnvVar } from "../../../support/apiEnv";
import type { Env } from "@functions/api/types";
import { signedWebhookRequest } from "./support/stripe-webhook";

const WEBHOOK_SECRET = "whsec_ordering_test";
const PRICE_ID = "price_pro";
const USER_ID = "user-1";
const CUSTOMER_ID = "cus_1";
const SUBSCRIPTION_ID = "sub_1";

type SubscriptionState = {
  status: string;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
};

let d1: SqliteD1;
let stripeState: SubscriptionState | null;
let stripeGetStatus: number;

function subscriptionObject(state: SubscriptionState) {
  return {
    id: SUBSCRIPTION_ID,
    object: "subscription",
    customer: CUSTOMER_ID,
    status: state.status,
    cancel_at_period_end: state.cancel_at_period_end ?? false,
    canceled_at: state.canceled_at ?? null,
    trial_end: null,
    metadata: { userId: USER_ID },
    items: { data: [{ current_period_end: 1_900_000_000, price: { id: PRICE_ID } }] },
  };
}

function env(overrides: Partial<Env> = {}): Env {
  return apiEnv({
    DB: d1.binding,
    BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_SECRET_KEY: "sk_test_ordering",
    STRIPE_PRO_PRICE_ID: PRICE_ID,
    ...overrides,
  });
}

async function deliver(
  eventId: string,
  type: string,
  created: number,
  payloadState: SubscriptionState,
  varsLeftOut: OptionalEnvVar[] = [],
): Promise<Response> {
  const request = await signedWebhookRequest(
    { id: eventId, type, created, livemode: false, data: { object: subscriptionObject(payloadState) } },
    WEBHOOK_SECRET,
  );
  return handleStripe(request, withoutVars(env(), varsLeftOut));
}

function recordFailedEarlierDelivery(eventId: string, type: string, created: number) {
  d1.sqlite
    .prepare("INSERT INTO stripe_webhook_events (id, type, created, livemode, processed_at, error) VALUES (?, ?, ?, 0, ?, ?)")
    .run(eventId, type, created, "2026-01-01T00:00:00.000Z", "D1_ERROR: transient");
}

function storedStatus(): string | undefined {
  return d1.rows<{ status: string }>(
    "SELECT status FROM stripe_subscriptions WHERE stripe_subscription_id = ?",
    SUBSCRIPTION_ID,
  )[0]?.status;
}

async function plan(): Promise<string> {
  return (await getEntitlementsForUser(env(), USER_ID)).plan;
}

beforeEach(() => {
  d1 = new SqliteD1({ schemaSql: billingSchemaSql() });
  seedBillingUser(d1, USER_ID);
  stripeState = null;
  stripeGetStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? "GET") === "GET" && url === `https://api.stripe.com/v1/subscriptions/${SUBSCRIPTION_ID}`) {
        if (stripeGetStatus !== 200 || !stripeState) {
          return new Response(JSON.stringify({ error: { type: "api_error" } }), { status: stripeGetStatus });
        }
        return new Response(JSON.stringify(subscriptionObject(stripeState)), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  d1.close();
});

describe("Stripe webhook subscription events delivered out of order, or retried after newer ones", () => {
  it("keeps an active subscription when the older created event arrives last", async () => {
    stripeState = { status: "active" };

    expect((await deliver("evt_updated", "customer.subscription.updated", 101, { status: "active" })).status).toBe(200);
    expect((await deliver("evt_created", "customer.subscription.created", 100, { status: "incomplete" })).status).toBe(200);

    expect(storedStatus()).toBe("active");
    expect(await plan()).toBe("pro");
  });

  it("keeps a canceled subscription canceled when an older failed update is retried", async () => {
    recordFailedEarlierDelivery("evt_cancel_at_period_end", "customer.subscription.updated", 200);
    stripeState = { status: "canceled", canceled_at: 300 };

    expect((await deliver("evt_deleted", "customer.subscription.deleted", 300, {
      status: "canceled",
      canceled_at: 300,
    })).status).toBe(200);
    const retry = await deliver("evt_cancel_at_period_end", "customer.subscription.updated", 200, {
      status: "active",
      cancel_at_period_end: true,
    });

    expect(retry.status).toBe(200);
    expect(storedStatus()).toBe("canceled");
    expect(await plan()).toBe("free");
    expect(d1.rows("SELECT error FROM stripe_webhook_events WHERE id = ?", "evt_cancel_at_period_end")).toEqual([
      { error: null },
    ]);
  });

  it("does not downgrade a recovered subscription when a stale past_due event is retried", async () => {
    recordFailedEarlierDelivery("evt_past_due", "customer.subscription.updated", 400);
    stripeState = { status: "active" };

    await deliver("evt_recovered", "customer.subscription.updated", 500, { status: "active" });
    await deliver("evt_past_due", "customer.subscription.updated", 400, { status: "past_due" });

    expect(storedStatus()).toBe("active");
    expect(await plan()).toBe("pro");
  });

  it("writes the state Stripe returns rather than the event snapshot", async () => {
    stripeState = { status: "active" };

    await deliver("evt_created", "customer.subscription.created", 100, { status: "incomplete" });

    expect(storedStatus()).toBe("active");
  });

  it("returns 500 and records the error when Stripe cannot be reached, so Stripe retries", async () => {
    stripeGetStatus = 503;

    const response = await deliver("evt_updated", "customer.subscription.updated", 100, { status: "active" });

    expect(response.status).toBe(500);
    expect(storedStatus()).toBeUndefined();
    expect(d1.rows<{ error: string }>("SELECT error FROM stripe_webhook_events WHERE id = ?", "evt_updated")[0]?.error)
      .toContain("503");
  });

  it("acknowledges an event for a subscription Stripe no longer has without writing it", async () => {
    stripeGetStatus = 404;

    const response = await deliver("evt_missing", "customer.subscription.updated", 100, { status: "active" });

    expect(response.status).toBe(200);
    expect(storedStatus()).toBeUndefined();
    expect(await plan()).toBe("free");
  });

  it("never reopens a canceled subscription or rewinds to incomplete without a secret key", async () => {
    const noSecretKey: OptionalEnvVar[] = ["STRIPE_SECRET_KEY"];

    await deliver("evt_updated", "customer.subscription.updated", 101, { status: "active" }, noSecretKey);
    await deliver("evt_created", "customer.subscription.created", 100, { status: "incomplete" }, noSecretKey);
    expect(storedStatus()).toBe("active");

    await deliver("evt_deleted", "customer.subscription.deleted", 300, { status: "canceled" }, noSecretKey);
    await deliver("evt_stale", "customer.subscription.updated", 200, { status: "active" }, noSecretKey);
    expect(storedStatus()).toBe("canceled");
    expect(fetch).not.toHaveBeenCalled();
  });
});

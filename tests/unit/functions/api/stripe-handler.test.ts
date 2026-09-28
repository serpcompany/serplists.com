import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleStripe } from "@functions/api/handlers/stripe";
import { billingSchemaSql, createSqliteD1, type SqliteD1 } from "./support/sqlite-d1";
import { signedWebhookRequest } from "./support/stripe-webhook";

const WEBHOOK_SECRET = "whsec_test";

let d1: SqliteD1;

function env() {
  return {
    DB: d1.binding,
    BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_SECRET_KEY: "sk_test_handler",
  } as never;
}

function subscriptionObject() {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    metadata: { userId: "user-123" },
    items: {
      data: [
        {
          current_period_end: 1_800_000_000,
          price: { id: "price_live_example" },
        },
      ],
    },
  };
}

async function deliver(event: Record<string, unknown>): Promise<Response> {
  return handleStripe(await signedWebhookRequest(event, WEBHOOK_SECRET), env());
}

function checkoutCompletedEvent(id: string) {
  return {
    id,
    type: "checkout.session.completed",
    created: 123,
    livemode: true,
    data: { object: { customer: "cus_123", metadata: { userId: "user-123" } } },
  };
}

describe("Stripe webhook handler", () => {
  beforeEach(() => {
    d1 = createSqliteD1(billingSchemaSql());
    d1.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run("user-123", "user-123@example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(subscriptionObject()), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    d1.close();
  });

  it("uses metadata userId fallback for checkout completion", async () => {
    const response = await deliver(checkoutCompletedEvent("evt_checkout"));

    expect(response.status).toBe(200);
    expect(d1.rows("SELECT user_id, stripe_customer_id FROM stripe_customers")).toEqual([
      { user_id: "user-123", stripe_customer_id: "cus_123" },
    ]);
  });

  it("upserts the customer mapping and the subscription", async () => {
    const response = await deliver({
      id: "evt_subscription",
      type: "customer.subscription.updated",
      created: 123,
      livemode: true,
      data: { object: subscriptionObject() },
    });

    expect(response.status).toBe(200);
    expect(d1.rows("SELECT user_id, stripe_customer_id FROM stripe_customers")).toEqual([
      { user_id: "user-123", stripe_customer_id: "cus_123" },
    ]);
    expect(d1.rows(`
      SELECT stripe_subscription_id, user_id, stripe_customer_id, price_id, status, current_period_end
      FROM stripe_subscriptions
    `)).toEqual([{
      stripe_subscription_id: "sub_123",
      user_id: "user-123",
      stripe_customer_id: "cus_123",
      price_id: "price_live_example",
      status: "active",
      current_period_end: 1_800_000_000,
    }]);
  });

  it("returns duplicate when the webhook event was already recorded", async () => {
    await deliver(checkoutCompletedEvent("evt_duplicate"));

    const response = await deliver(checkoutCompletedEvent("evt_duplicate"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.duplicate).toBe(true);
  });

  it("retries a previously failed webhook event instead of treating it as a duplicate", async () => {
    d1.sqlite
      .prepare("INSERT INTO stripe_webhook_events (id, type, created, livemode, processed_at, error) VALUES (?, ?, ?, 1, ?, ?)")
      .run("evt_retry_success", "checkout.session.completed", 123, "2026-01-01T00:00:00.000Z", "previous failure");

    const response = await deliver(checkoutCompletedEvent("evt_retry_success"));

    expect(response.status).toBe(200);
    expect(d1.rows("SELECT user_id, stripe_customer_id FROM stripe_customers")).toEqual([
      { user_id: "user-123", stripe_customer_id: "cus_123" },
    ]);
    expect(d1.rows("SELECT error FROM stripe_webhook_events WHERE id = ?", "evt_retry_success")).toEqual([
      { error: null },
    ]);
  });

  it("returns 500 and records the error so Stripe can retry", async () => {
    d1.sqlite.exec("DROP TABLE stripe_customers");

    const response = await deliver({
      id: "evt_retry",
      type: "customer.subscription.updated",
      created: 123,
      livemode: true,
      data: { object: subscriptionObject() },
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Stripe webhook processing failed");
    expect(d1.rows<{ error: string }>("SELECT error FROM stripe_webhook_events WHERE id = ?", "evt_retry")[0]?.error)
      .toContain("from \"stripe_customers\"");
  });
});

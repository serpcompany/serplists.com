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

function subscriptionEvent(id: string, object: Record<string, unknown> = subscriptionObject()) {
  return { id, type: "customer.subscription.created", created: 123, livemode: true, data: { object } };
}

function eventErrors(id: string) {
  return d1.rows<{ error: string | null }>("SELECT error FROM stripe_webhook_events WHERE id = ?", id);
}

function storedSubscriptions() {
  return d1.rows<{ status: string }>("SELECT status FROM stripe_subscriptions");
}

const D1_OUTAGE = "D1_ERROR: Network connection lost";

/** Fails every write after the first `okWrites`, as a D1 incident that starts mid-delivery would. */
function failWritesAfter(okWrites: number) {
  let writes = 0;
  d1.setStatementHook((sql) => {
    if (/^\s*select/i.test(sql)) return;
    writes += 1;
    if (writes > okWrites) throw new Error(D1_OUTAGE);
  });
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

  it("records nothing for an event until its writes commit", async () => {
    let eventRowsDuringProcessing: unknown[] | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        eventRowsDuringProcessing = eventErrors("evt_in_flight");
        return new Response(JSON.stringify(subscriptionObject()), { status: 200 });
      }),
    );

    const response = await deliver(subscriptionEvent("evt_in_flight"));

    expect(response.status).toBe(200);
    // A Worker killed at this point leaves no row, so Stripe's retry processes the event.
    expect(eventRowsDuringProcessing).toEqual([]);
    expect(eventErrors("evt_in_flight")).toEqual([{ error: null }]);
  });

  it("processes a retry when the writes and the error record both failed", async () => {
    failWritesAfter(1);
    const failed = await deliver(subscriptionEvent("evt_outage"));
    expect(failed.status).toBe(500);
    expect(storedSubscriptions()).toEqual([]);

    d1.setStatementHook(null);
    const retried = await deliver(subscriptionEvent("evt_outage"));

    expect(retried.status).toBe(200);
    expect(await retried.json()).toEqual({ received: true });
    expect(storedSubscriptions()).toEqual([{ status: "active" }]);
    expect(eventErrors("evt_outage")).toEqual([{ error: null }]);
  });

  it("returns 500, not duplicate, when a D1 write fails before anything is recorded", async () => {
    d1.setStatementHook((sql) => {
      if (/^\s*select/i.test(sql)) return;
      // Only the first write fails; the error record afterwards succeeds.
      d1.setStatementHook(null);
      throw new Error(D1_OUTAGE);
    });

    const response = await deliver(checkoutCompletedEvent("evt_transient"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.duplicate).toBeUndefined();
    expect(d1.rows("SELECT user_id FROM stripe_customers")).toEqual([]);

    const retried = await deliver(checkoutCompletedEvent("evt_transient"));
    expect(await retried.json()).toEqual({ received: true });
    expect(d1.rows("SELECT user_id FROM stripe_customers")).toEqual([{ user_id: "user-123" }]);
  });

  it("returns 500 when a new subscription's write fails, so nothing is lost", async () => {
    d1.setStatementHook((sql) => {
      if (/^insert into "stripe_subscriptions"/i.test(sql)) throw new Error(D1_OUTAGE);
    });

    const response = await deliver(subscriptionEvent("evt_subscription_write"));

    expect(response.status).toBe(500);
    expect(storedSubscriptions()).toEqual([]);
    // The customer mapping in the same batch is rolled back with it.
    expect(d1.rows("SELECT user_id FROM stripe_customers")).toEqual([]);
    expect(eventErrors("evt_subscription_write")[0]?.error).toBeTruthy();
  });

  it("keeps a concurrent delivery's success when this delivery then fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        // Another delivery of the same event commits while this one reads Stripe...
        d1.sqlite.prepare(`
          INSERT INTO stripe_webhook_events (id, type, created, livemode, processed_at, error)
          VALUES ('evt_concurrent', 'customer.subscription.created', 123, 1, '2026-01-01T00:00:00.000Z', NULL)
          ON CONFLICT (id) DO UPDATE SET error = NULL
        `).run();
        // ...and then this delivery's writes fail.
        d1.setStatementHook((sql) => {
          if (/^insert into "stripe_subscriptions"/i.test(sql)) throw new Error(D1_OUTAGE);
        });
        return new Response(JSON.stringify(subscriptionObject()), { status: 200 });
      }),
    );

    const response = await deliver(subscriptionEvent("evt_concurrent"));

    expect(response.status).toBe(500);
    expect(eventErrors("evt_concurrent")).toEqual([{ error: null }]);
  });

  it("marks events it does not act on as handled", async () => {
    const event = { id: "evt_invoice", type: "invoice.payment_succeeded", created: 123, livemode: true, data: { object: {} } };

    expect(await (await deliver(event)).json()).toEqual({ received: true });
    expect(eventErrors("evt_invoice")).toEqual([{ error: null }]);
    expect((await (await deliver(event)).json()).duplicate).toBe(true);
  });

  it("acknowledges a subscription event for a user who no longer exists instead of failing forever", async () => {
    const object = { ...subscriptionObject(), customer: "cus_gone", metadata: { userId: "user-deleted" } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(object), { status: 200 })));

    const response = await deliver(subscriptionEvent("evt_deleted_user", object));

    expect(response.status).toBe(200);
    expect(storedSubscriptions()).toEqual([]);
    expect(eventErrors("evt_deleted_user")).toEqual([{ error: null }]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = {
    values: vi.fn(),
  };
  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
  };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
  };

  return { db, selectChain, insertChain, updateChain };
});

const stripeMocks = vi.hoisted(() => ({
  assertStripeWebhookConfigured: vi.fn(() => ({ webhookSecret: "whsec_test" })),
  verifyStripeWebhookSignature: vi.fn(async () => ({ ok: true as const, timestamp: 123 })),
}));

vi.mock("@functions/api/db", () => ({
  createDb: vi.fn(() => dbMocks.db),
  schema: {
    stripe_webhook_events: { id: "stripe_webhook_events.id" },
    stripe_customers: {
      user_id: "stripe_customers.user_id",
      stripe_customer_id: "stripe_customers.stripe_customer_id",
    },
    stripe_subscriptions: { stripe_subscription_id: "stripe_subscriptions.stripe_subscription_id" },
  },
}));

vi.mock("@functions/api/utils/stripe", () => ({
  assertStripeWebhookConfigured: stripeMocks.assertStripeWebhookConfigured,
  verifyStripeWebhookSignature: stripeMocks.verifyStripeWebhookSignature,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

import { handleStripe } from "@functions/api/handlers/stripe";

const mockEnv = {
  DB: {} as D1Database,
  BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
} as const;

describe("Stripe webhook handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockResolvedValue(undefined);
    stripeMocks.assertStripeWebhookConfigured.mockReturnValue({ webhookSecret: "whsec_test" });
    stripeMocks.verifyStripeWebhookSignature.mockResolvedValue({ ok: true, timestamp: 123 });
  });

  it("uses metadata userId fallback for checkout completion", async () => {
    const request = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "Stripe-Signature": "t=123,v1=test" },
      body: JSON.stringify({
        id: "evt_checkout",
        type: "checkout.session.completed",
        created: 123,
        livemode: true,
        data: {
          object: {
            customer: "cus_123",
            metadata: { userId: "user-123" },
          },
        },
      }),
    });

    const response = await handleStripe(request, mockEnv);

    expect(response.status).toBe(200);
    expect(dbMocks.insertChain.values).toHaveBeenNthCalledWith(2, expect.objectContaining({
      user_id: "user-123",
      stripe_customer_id: "cus_123",
    }));
  });

  it("upserts the customer mapping before writing subscriptions", async () => {
    const request = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "Stripe-Signature": "t=123,v1=test" },
      body: JSON.stringify({
        id: "evt_subscription",
        type: "customer.subscription.updated",
        created: 123,
        livemode: true,
        data: {
          object: {
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
          },
        },
      }),
    });

    const response = await handleStripe(request, mockEnv);

    expect(response.status).toBe(200);
    expect(dbMocks.insertChain.values).toHaveBeenNthCalledWith(2, expect.objectContaining({
      user_id: "user-123",
      stripe_customer_id: "cus_123",
    }));
    expect(dbMocks.insertChain.values).toHaveBeenNthCalledWith(3, expect.objectContaining({
      stripe_subscription_id: "sub_123",
      user_id: "user-123",
      stripe_customer_id: "cus_123",
      price_id: "price_live_example",
      status: "active",
      current_period_end: 1_800_000_000,
    }));
  });

  it("returns duplicate when the webhook event was already recorded", async () => {
    dbMocks.insertChain.values.mockRejectedValueOnce(new Error("duplicate"));
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ error: null }]);

    const request = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "Stripe-Signature": "t=123,v1=test" },
      body: JSON.stringify({
        id: "evt_duplicate",
        type: "checkout.session.completed",
        created: 123,
        livemode: true,
        data: { object: {} },
      }),
    });

    const response = await handleStripe(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.duplicate).toBe(true);
  });

  it("retries a previously failed webhook event instead of treating it as a duplicate", async () => {
    dbMocks.insertChain.values.mockRejectedValueOnce(new Error("duplicate"));
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ error: "previous failure" }]);

    const request = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "Stripe-Signature": "t=123,v1=test" },
      body: JSON.stringify({
        id: "evt_retry_success",
        type: "checkout.session.completed",
        created: 123,
        livemode: true,
        data: {
          object: {
            customer: "cus_123",
            metadata: { userId: "user-123" },
          },
        },
      }),
    });

    const response = await handleStripe(request, mockEnv);

    expect(response.status).toBe(200);
    expect(dbMocks.insertChain.values).toHaveBeenNthCalledWith(2, expect.objectContaining({
      user_id: "user-123",
      stripe_customer_id: "cus_123",
    }));
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      error: null,
      processed_at: expect.any(String),
    }));
  });

  it("returns 500 and records the error so Stripe can retry", async () => {
    dbMocks.selectChain.limit.mockRejectedValueOnce(new Error("boom"));

    const request = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "Stripe-Signature": "t=123,v1=test" },
      body: JSON.stringify({
        id: "evt_retry",
        type: "customer.subscription.updated",
        created: 123,
        livemode: true,
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            metadata: { userId: "user-123" },
            items: {
              data: [
                {
                  price: { id: "price_live_example" },
                },
              ],
            },
          },
        },
      }),
    });

    const response = await handleStripe(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Stripe webhook processing failed");
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith({ error: "boom" });
  });
});

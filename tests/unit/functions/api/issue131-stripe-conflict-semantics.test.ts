import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tables = {
    events: { id: "events.id", error: "events.error" },
    customers: { user_id: "customers.user_id", stripe_customer_id: "customers.stripe_customer_id" },
    subscriptions: { stripe_subscription_id: "subscriptions.stripe_subscription_id" },
  };
  const insertBuilder = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    returning: vi.fn(),
  };
  const selectBuilder = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  const updateBuilder = { set: vi.fn(), where: vi.fn() };
  const db = {
    insert: vi.fn(() => insertBuilder),
    select: vi.fn(() => selectBuilder),
    update: vi.fn(() => updateBuilder),
  };
  return { tables, insertBuilder, selectBuilder, updateBuilder, db };
});

vi.mock("@functions/api/db", () => ({
  createDb: vi.fn(() => mocks.db),
  schema: {
    stripe_webhook_events: mocks.tables.events,
    stripe_customers: mocks.tables.customers,
    stripe_subscriptions: mocks.tables.subscriptions,
  },
}));

vi.mock("@functions/api/utils/stripe", () => ({
  assertStripeWebhookConfigured: vi.fn(() => ({ webhookSecret: "whsec_issue131" })),
  verifyStripeWebhookSignature: vi.fn(async () => ({ ok: true as const, timestamp: 131 })),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

import { handleStripe } from "@functions/api/handlers/stripe";

const env = {
  DB: {} as D1Database,
  BETTER_AUTH_SECRET: "issue131-test-auth-secret-at-least-32-chars",
  STRIPE_WEBHOOK_SECRET: "whsec_issue131",
} as const;

function webhook(id: string, type = "checkout.session.completed") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "Stripe-Signature": "t=131,v1=test" },
    body: JSON.stringify({
      id,
      type,
      created: 131,
      livemode: false,
      data: {
        object: {
          client_reference_id: "user-131",
          customer: "cus_131",
        },
      },
    }),
  });
}

describe("issue 131 Stripe conflict semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertBuilder.values.mockReturnValue(mocks.insertBuilder);
    mocks.insertBuilder.onConflictDoNothing.mockReturnValue(mocks.insertBuilder);
    mocks.insertBuilder.onConflictDoUpdate.mockResolvedValue(undefined);
    mocks.insertBuilder.returning.mockResolvedValue([{ id: "claimed" }]);
    mocks.selectBuilder.from.mockReturnValue(mocks.selectBuilder);
    mocks.selectBuilder.where.mockReturnValue(mocks.selectBuilder);
    mocks.selectBuilder.limit.mockResolvedValue([]);
    mocks.updateBuilder.set.mockReturnValue(mocks.updateBuilder);
    mocks.updateBuilder.where.mockResolvedValue(undefined);
  });

  it("targets only the event and customer primary keys", async () => {
    const response = await handleStripe(webhook("evt_targets"), env);

    expect(response.status).toBe(200);
    expect(mocks.insertBuilder.onConflictDoNothing).toHaveBeenCalledWith({
      target: mocks.tables.events.id,
    });
    expect(mocks.insertBuilder.onConflictDoUpdate).toHaveBeenCalledWith({
      target: mocks.tables.customers.user_id,
      set: expect.objectContaining({ stripe_customer_id: "cus_131" }),
    });
  });

  it("propagates a non-conflict event-claim failure", async () => {
    mocks.insertBuilder.onConflictDoNothing.mockImplementationOnce(() => {
      throw new Error("synthetic event insert failure");
    });

    await expect(handleStripe(webhook("evt_claim_failure"), env)).rejects.toThrow(
      "synthetic event insert failure",
    );
  });

  it("fails when a no-op claim has no persisted event", async () => {
    mocks.insertBuilder.returning.mockResolvedValueOnce([]);
    mocks.selectBuilder.limit.mockResolvedValueOnce([]);

    await expect(handleStripe(webhook("evt_absent_claim"), env)).rejects.toThrow(
      "Stripe webhook event claim was not persisted",
    );
  });

  it("acknowledges only an already completed persisted event", async () => {
    mocks.insertBuilder.returning.mockResolvedValueOnce([]);
    mocks.selectBuilder.limit.mockResolvedValueOnce([{ id: "evt_duplicate", error: null }]);

    const response = await handleStripe(webhook("evt_duplicate"), env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, duplicate: true });
    expect(mocks.insertBuilder.onConflictDoUpdate).not.toHaveBeenCalled();
  });

  it("returns retryable failure when the targeted customer upsert fails", async () => {
    mocks.insertBuilder.onConflictDoUpdate.mockRejectedValueOnce(
      new Error("synthetic customer write failure"),
    );

    const response = await handleStripe(webhook("evt_customer_failure"), env);

    expect(response.status).toBe(500);
    expect(mocks.updateBuilder.set).toHaveBeenCalledWith({
      error: "synthetic customer write failure",
    });
  });
});

import type { DatabaseSync } from "node:sqlite";
import { handleBilling } from "@functions/api/handlers/billing";

type BillingDatabase = { binding: D1Database; sqlite: DatabaseSync };
type BillingAnswer = { status: number; body: Record<string, unknown> };

export const PRO_PRICE_ID = "price_pro";
const STORED_AT = "2026-01-01T00:00:00.000Z";

export function stripeBillingEnv(database: BillingDatabase, extraVars: Record<string, string> = {}) {
  return {
    DB: database.binding,
    BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!",
    STRIPE_SECRET_KEY: "sk_test_billing",
    STRIPE_PRO_PRICE_ID: PRO_PRICE_ID,
    ...extraVars,
  } as never;
}

export async function postToBilling(env: never, path: "checkout" | "portal"): Promise<BillingAnswer> {
  const response = await handleBilling(new Request(`http://localhost/api/billing/${path}`, { method: "POST", body: "{}" }), env);
  return { status: response.status, body: await response.json() };
}

export function seedBillingUser(database: BillingDatabase, userId: string, stripeCustomerId?: string) {
  database.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(userId, `${userId}@example.test`);
  if (!stripeCustomerId) return;
  database.sqlite
    .prepare("INSERT INTO stripe_customers (user_id, stripe_customer_id, created_at) VALUES (?, ?, ?)")
    .run(userId, stripeCustomerId, STORED_AT);
}

type SubscriptionFields = { id: string; userId: string; customerId: string; status: string; priceId?: string };

export function storeSubscriptionRow(database: BillingDatabase, { id, userId, customerId, status, priceId = PRO_PRICE_ID }: SubscriptionFields) {
  database.sqlite.prepare(`
    INSERT INTO stripe_subscriptions (
      stripe_subscription_id, user_id, stripe_customer_id, price_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, customerId, priceId, status, STORED_AT, STORED_AT);
}

export function stripeSubscription({ id, userId, customerId, status, priceId = PRO_PRICE_ID }: SubscriptionFields) {
  return {
    id,
    object: "subscription",
    customer: customerId,
    status,
    metadata: { userId },
    items: { data: [{ current_period_end: 1_900_000_000, price: { id: priceId } }] },
  };
}

export const stripeErrorResponse = (status: number, error: Record<string, unknown>) =>
  new Response(JSON.stringify({ error }), { status });

export const emptyStripeList = () => new Response(JSON.stringify({ object: "list", data: [], has_more: false }));

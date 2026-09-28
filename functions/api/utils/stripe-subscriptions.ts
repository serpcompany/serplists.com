import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { schema, type createDb } from "../db";
import { log } from "./logger";
import { StripeApiError, stripeGet } from "./stripe";

type Db = ReturnType<typeof createDb>;

// Stripe ends a subscription in one of these statuses and never reopens it.
const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

export function isTerminalSubscriptionStatus(status: string): boolean {
  return TERMINAL_SUBSCRIPTION_STATUSES.has(status);
}

// Expandable references arrive as an id string, or as an object when expanded.
const stripeIdSchema = z
  .union([z.string().min(1), z.object({ id: z.string().min(1) }).passthrough()])
  .transform((value) => (typeof value === "string" ? value : value.id));

const subscriptionItemSchema = z
  .object({
    price: z.object({ id: z.string().min(1) }).passthrough(),
    // Newer Stripe API versions keep the period on each item instead of the subscription.
    current_period_end: z.number().nullish(),
  })
  .passthrough();

const stripeSubscriptionSchema = z
  .object({
    id: z.string().min(1),
    customer: stripeIdSchema,
    status: z.string().min(1),
    cancel_at_period_end: z.boolean().nullish(),
    canceled_at: z.number().nullish(),
    trial_end: z.number().nullish(),
    current_period_end: z.number().nullish(),
    metadata: z.record(z.unknown()).nullish(),
    items: z.object({ data: z.array(subscriptionItemSchema).min(1) }).passthrough(),
  })
  .passthrough();

export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  status: string;
  priceId: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;
  trialEnd: number | null;
  metadataUserId: string | null;
};

/** Parses a Stripe subscription object (webhook payload or API response). */
export function parseSubscriptionSnapshot(value: unknown): SubscriptionSnapshot | null {
  const parsed = stripeSubscriptionSchema.safeParse(value);
  if (!parsed.success) return null;

  const subscription = parsed.data;
  const [firstItem] = subscription.items.data;
  const metadataUserId = subscription.metadata?.userId;
  return {
    id: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
    priceId: firstItem.price.id,
    currentPeriodEnd: subscription.current_period_end ?? firstItem.current_period_end ?? null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    canceledAt: subscription.canceled_at ?? null,
    trialEnd: subscription.trial_end ?? null,
    metadataUserId: typeof metadataUserId === "string" && metadataUserId.length > 0 ? metadataUserId : null,
  };
}

/**
 * Returns the subscription state to store for a customer.subscription.* event.
 *
 * Stripe does not deliver events in order and retries failed events after newer ones,
 * so an event snapshot can be stale. The current state is read from Stripe instead.
 * A terminal snapshot is already final. Without a secret key the snapshot is used and
 * the write guard in upsertStripeSubscription still blocks impossible transitions.
 * Returns null when Stripe has no such subscription.
 */
export async function loadCurrentSubscription(
  env: Env,
  eventSnapshot: SubscriptionSnapshot,
): Promise<SubscriptionSnapshot | null> {
  if (isTerminalSubscriptionStatus(eventSnapshot.status)) return eventSnapshot;

  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    log("warn", "stripe_subscription_refetch_skipped", {
      stripeSubscriptionId: eventSnapshot.id,
      reason: "missing_secret_key",
    });
    return eventSnapshot;
  }

  let body: unknown;
  try {
    body = await stripeGet(secretKey, `/v1/subscriptions/${encodeURIComponent(eventSnapshot.id)}`);
  } catch (error) {
    if (error instanceof StripeApiError && error.status === 404) {
      log("warn", "stripe_subscription_not_found", { stripeSubscriptionId: eventSnapshot.id });
      return null;
    }
    throw error;
  }

  const current = parseSubscriptionSnapshot(body);
  if (!current || current.id !== eventSnapshot.id) {
    throw new Error("Stripe returned an unexpected subscription shape");
  }
  return { ...current, metadataUserId: current.metadataUserId ?? eventSnapshot.metadataUserId };
}

export async function upsertStripeCustomer(db: Db, userId: string, stripeCustomerId: string, nowIso: string) {
  const { stripe_customers } = schema;
  await db
    .insert(stripe_customers)
    .values({ user_id: userId, stripe_customer_id: stripeCustomerId, created_at: nowIso, updated_at: nowIso })
    .onConflictDoUpdate({
      target: stripe_customers.user_id,
      set: { stripe_customer_id: stripeCustomerId, updated_at: nowIso },
    });
}

export async function upsertStripeSubscription(
  db: Db,
  userId: string,
  subscription: SubscriptionSnapshot,
  nowIso: string,
) {
  const { stripe_subscriptions } = schema;
  const state = {
    user_id: userId,
    stripe_customer_id: subscription.customerId,
    price_id: subscription.priceId,
    status: subscription.status,
    current_period_end: subscription.currentPeriodEnd,
    cancel_at_period_end: subscription.cancelAtPeriodEnd,
    canceled_at: subscription.canceledAt,
    trial_end: subscription.trialEnd,
    updated_at: nowIso,
  };

  await db
    .insert(stripe_subscriptions)
    .values({ stripe_subscription_id: subscription.id, ...state, created_at: nowIso })
    .onConflictDoUpdate({
      target: stripe_subscriptions.stripe_subscription_id,
      set: state,
      // Stripe never reopens a canceled or expired subscription and never returns one to
      // incomplete, so a late or concurrent older write cannot do either.
      setWhere: sql`${stripe_subscriptions.status} NOT IN ('canceled', 'incomplete_expired')
        AND (excluded.status <> 'incomplete' OR ${stripe_subscriptions.status} = 'incomplete')`,
    });
}

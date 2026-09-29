import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { log } from "./logger";
import { StripeApiError, stripeGet } from "./stripe";

type Db = ReturnType<typeof createDb>;

// Stripe ends a subscription in one of these statuses and never reopens it.
const TERMINAL_SUBSCRIPTION_STATUSES = ["canceled", "incomplete_expired"];

// Open (non-terminal) statuses, most urgent first: statuses that need the customer to
// act come before paid-up ones, so a failed payment is what the account surfaces.
const OPEN_SUBSCRIPTION_STATUS_PRIORITY = ["past_due", "unpaid", "paused", "incomplete", "active", "trialing"];

export function isTerminalSubscriptionStatus(status: string): boolean {
  return TERMINAL_SUBSCRIPTION_STATUSES.includes(status);
}

/** Statuses that grant Pro. Other open statuses keep billing the customer without it. */
export function isPaidSubscriptionStatus(status: string): boolean {
  return status === "active" || status === "trialing";
}

function statusPriority(status: string): number {
  const index = OPEN_SUBSCRIPTION_STATUS_PRIORITY.indexOf(status);
  // A status Stripe adds later is open but unknown: rank it after the known ones.
  return index === -1 ? OPEN_SUBSCRIPTION_STATUS_PRIORITY.length : index;
}

export type PersonalSubscriptionSummary = {
  /** The most urgent open subscription status across every price, or null. */
  openStatus: string | null;
  /** A Stripe customer exists, so the Customer Portal can open. */
  hasCustomer: boolean;
};

export type StoredOpenSubscription = { id: string | null; customerId: string; status: string };

/** The user's stored subscriptions that have not ended, on any customer and price. */
export async function listOpenStoredSubscriptions(db: Db, userId: string): Promise<StoredOpenSubscription[]> {
  const { stripe_subscriptions } = schema;
  return db
    .select({
      id: stripe_subscriptions.stripe_subscription_id,
      customerId: stripe_subscriptions.stripe_customer_id,
      status: stripe_subscriptions.status,
    })
    .from(stripe_subscriptions)
    .where(
      and(
        eq(stripe_subscriptions.user_id, userId),
        notInArray(stripe_subscriptions.status, TERMINAL_SUBSCRIPTION_STATUSES),
      ),
    )
    .limit(10);
}

/**
 * Summarizes a user's stored Stripe billing state for Billing. Once the user has a
 * Stripe customer, only that customer's subscriptions count: the Customer Portal
 * shows only those, and one stored for a customer that checkout or the portal
 * replaced (Stripe no longer had it) would otherwise offer a portal that cannot
 * manage it instead of Upgrade. Checkout asks Stripe about every open subscription.
 */
export async function getPersonalSubscriptionSummary(env: Env, userId: string): Promise<PersonalSubscriptionSummary> {
  const db = createDb(env);
  const { stripe_customers } = schema;
  const [customers, openSubscriptions] = await Promise.all([
    db
      .select({ stripeCustomerId: stripe_customers.stripe_customer_id })
      .from(stripe_customers)
      .where(eq(stripe_customers.user_id, userId))
      .limit(1),
    listOpenStoredSubscriptions(db, userId),
  ]);

  const [customer] = customers;
  const counted = customer
    ? openSubscriptions.filter((subscription) => subscription.customerId === customer.stripeCustomerId)
    : openSubscriptions;
  return {
    openStatus: mostUrgentOpenStatus(counted.map((subscription) => subscription.status)),
    hasCustomer: customers.length > 0,
  };
}

/**
 * The most urgent status among the user's open stored subscriptions on one of
 * `priceIds`, on any customer, or null.
 */
export async function openStoredStatusOnPrices(db: Db, userId: string, priceIds: string[]): Promise<string | null> {
  const { stripe_subscriptions } = schema;
  const rows = await db
    .select({ status: stripe_subscriptions.status })
    .from(stripe_subscriptions)
    .where(
      and(
        eq(stripe_subscriptions.user_id, userId),
        inArray(stripe_subscriptions.price_id, priceIds),
        notInArray(stripe_subscriptions.status, TERMINAL_SUBSCRIPTION_STATUSES),
      ),
    )
    .limit(10);
  return mostUrgentOpenStatus(rows.map((row) => row.status));
}

/** The most urgent open (non-terminal) status among `statuses`, or null. */
export function mostUrgentOpenStatus(statuses: string[]): string | null {
  const [openStatus] = statuses
    .filter((status) => !isTerminalSubscriptionStatus(status))
    .sort((left, right) => statusPriority(left) - statusPriority(right));
  return openStatus ?? null;
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

const subscriptionListSchema = z
  .object({ data: z.array(z.unknown()), has_more: z.boolean() })
  .passthrough();

/**
 * Reads a subscription's current state from Stripe. Returns null when Stripe has no
 * such subscription; other failures throw.
 */
export async function retrieveSubscription(
  secretKey: string,
  subscriptionId: string,
): Promise<SubscriptionSnapshot | null> {
  let body: unknown;
  try {
    body = await stripeGet(secretKey, `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  } catch (error) {
    if (error instanceof StripeApiError && error.status === 404) {
      log("warn", "stripe_subscription_not_found", { stripeSubscriptionId: subscriptionId });
      return null;
    }
    throw error;
  }

  const current = parseSubscriptionSnapshot(body);
  if (!current || current.id !== subscriptionId) {
    throw new Error("Stripe returned an unexpected subscription shape");
  }
  return current;
}

/**
 * Asks Stripe for a customer's subscriptions, stores them, and returns the open ones.
 * D1 only learns about subscriptions from webhooks, which can lag or fail, so Checkout
 * checks here before selling a second subscription. Throws when Stripe cannot answer,
 * or when the list is incomplete and shows nothing open that blocks Checkout.
 */
export async function syncCustomerSubscriptions(
  env: Env,
  secretKey: string,
  userId: string,
  stripeCustomerId: string,
): Promise<SubscriptionSnapshot[]> {
  // Stripe's default filter leaves out canceled subscriptions, so the list stays short.
  const body = await stripeGet(
    secretKey,
    `/v1/subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&limit=100`,
  );
  const list = subscriptionListSchema.parse(body);
  const subscriptions = list.data.map(parseSubscriptionSnapshot);
  if (subscriptions.some((subscription) => subscription === null)) {
    throw new Error("Stripe returned an unexpected subscription shape");
  }
  const found = subscriptions.filter((subscription): subscription is SubscriptionSnapshot => subscription !== null);

  // An `incomplete` subscription may not block Checkout on its own (its session can be
  // reused), so a partial list must show something else open.
  const blocking = found.filter(
    (subscription) => !isTerminalSubscriptionStatus(subscription.status) && subscription.status !== "incomplete",
  );
  if (blocking.length === 0 && list.has_more) {
    throw new Error("Stripe returned an incomplete subscription list");
  }

  const [first, ...rest] = found;
  if (first) {
    const db = createDb(env);
    const nowIso = new Date().toISOString();
    await db.batch([
      upsertStripeSubscription(db, userId, first, nowIso),
      ...rest.map((subscription) => upsertStripeSubscription(db, userId, subscription, nowIso)),
    ]);
  }
  return found.filter((subscription) => !isTerminalSubscriptionStatus(subscription.status));
}

/**
 * Reads stored subscriptions from Stripe one by one, stores what Stripe returns, and
 * returns the ones still open. One Stripe does not have (made with the other mode's
 * keys, for example) is left as stored but not returned: a stored row is only ever
 * ended by Stripe saying so, never by a key that cannot see it. Throws when Stripe
 * cannot answer.
 */
export async function refreshStoredSubscriptions(
  env: Env,
  secretKey: string,
  userId: string,
  stored: StoredOpenSubscription[],
): Promise<SubscriptionSnapshot[]> {
  const found: SubscriptionSnapshot[] = [];
  for (const subscription of stored) {
    if (!subscription.id) throw new Error("A stored subscription has no id");
    const current = await retrieveSubscription(secretKey, subscription.id);
    if (current) found.push(current);
  }

  const [first, ...rest] = found;
  if (first) {
    const db = createDb(env);
    const nowIso = new Date().toISOString();
    await db.batch([
      upsertStripeSubscription(db, userId, first, nowIso),
      ...rest.map((subscription) => upsertStripeSubscription(db, userId, subscription, nowIso)),
    ]);
  }
  return found.filter((subscription) => !isTerminalSubscriptionStatus(subscription.status));
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

  const current = await retrieveSubscription(secretKey, eventSnapshot.id);
  if (!current) return null;
  return { ...current, metadataUserId: current.metadataUserId ?? eventSnapshot.metadataUserId };
}

// The upserts below return the statement unexecuted, so the webhook can commit them in
// one batch with its event record. Await one to run it on its own.

export function upsertStripeCustomer(db: Db, userId: string, stripeCustomerId: string, nowIso: string) {
  const { stripe_customers } = schema;
  return db
    .insert(stripe_customers)
    .values({ user_id: userId, stripe_customer_id: stripeCustomerId, created_at: nowIso, updated_at: nowIso })
    .onConflictDoUpdate({
      target: stripe_customers.user_id,
      set: { stripe_customer_id: stripeCustomerId, updated_at: nowIso },
    });
}

/**
 * Maps the customer to the user only when the user has no customer yet. An ended
 * subscription uses this, so its late event cannot move the user back to a customer
 * that checkout already replaced.
 */
export function linkStripeCustomerIfUnmapped(db: Db, userId: string, stripeCustomerId: string, nowIso: string) {
  const { stripe_customers } = schema;
  return db
    .insert(stripe_customers)
    .values({ user_id: userId, stripe_customer_id: stripeCustomerId, created_at: nowIso, updated_at: nowIso })
    .onConflictDoNothing();
}

export function upsertStripeSubscription(
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

  return db
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

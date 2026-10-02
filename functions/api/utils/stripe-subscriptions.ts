import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { log } from "./logger";
import { insertStripeCustomer } from "./stripe-customers";
import { StripeApiError, expandableStripeIdSchema, stripeGet } from "./stripe";

type Db = ReturnType<typeof createDb>;

const TERMINAL_SUBSCRIPTION_STATUSES = ["canceled", "incomplete_expired"];

const OPEN_SUBSCRIPTION_STATUSES_MOST_URGENT_FIRST = ["past_due", "unpaid", "paused", "incomplete", "active", "trialing"];
const UNKNOWN_OPEN_STATUS_RANK = OPEN_SUBSCRIPTION_STATUSES_MOST_URGENT_FIRST.length;

export function isTerminalSubscriptionStatus(status: string): boolean {
  return TERMINAL_SUBSCRIPTION_STATUSES.includes(status);
}

export function isPaidSubscriptionStatus(status: string): boolean {
  return status === "active" || status === "trialing";
}

function statusPriority(status: string): number {
  const index = OPEN_SUBSCRIPTION_STATUSES_MOST_URGENT_FIRST.indexOf(status);
  return index === -1 ? UNKNOWN_OPEN_STATUS_RANK : index;
}

export type PersonalSubscriptionSummary = {
  openStatus: string | null;
  hasCustomer: boolean;
};

export type StoredOpenSubscription = { id: string | null; customerId: string; status: string };

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

export function mostUrgentOpenStatus(statuses: string[]): string | null {
  const [openStatus] = statuses
    .filter((status) => !isTerminalSubscriptionStatus(status))
    .sort((left, right) => statusPriority(left) - statusPriority(right));
  return openStatus ?? null;
}

const subscriptionItemSchema = z
  .object({
    price: z.object({ id: z.string().min(1) }).passthrough(),
    current_period_end: z.number().nullish(),
  })
  .passthrough();

const stripeSubscriptionSchema = z
  .object({
    id: z.string().min(1),
    customer: expandableStripeIdSchema,
    status: z.string().min(1),
    cancel_at_period_end: z.boolean().nullish(),
    canceled_at: z.number().nullish(),
    trial_end: z.number().nullish(),
    current_period_end: z.number().nullish(),
    metadata: z.object({ userId: z.unknown() }).passthrough().nullish(),
    items: z.object({ data: z.array(subscriptionItemSchema).nonempty() }).passthrough(),
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

async function storeSubscriptions(env: Env, userId: string, subscriptions: SubscriptionSnapshot[]): Promise<void> {
  const [first, ...rest] = subscriptions;
  if (!first) return;
  const db = createDb(env);
  const nowIso = new Date().toISOString();
  await db.batch([
    upsertStripeSubscription(db, userId, first, nowIso),
    ...rest.map((subscription) => upsertStripeSubscription(db, userId, subscription, nowIso)),
  ]);
}

const stillOpen = (subscriptions: SubscriptionSnapshot[]): SubscriptionSnapshot[] =>
  subscriptions.filter((subscription) => !isTerminalSubscriptionStatus(subscription.status));

export async function syncCustomerSubscriptions(
  env: Env,
  secretKey: string,
  userId: string,
  stripeCustomerId: string,
): Promise<SubscriptionSnapshot[]> {
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

  const blockingCheckoutOnTheirOwn = stillOpen(found).filter((subscription) => subscription.status !== "incomplete");
  if (blockingCheckoutOnTheirOwn.length === 0 && list.has_more) {
    throw new Error("Stripe returned an incomplete subscription list");
  }

  await storeSubscriptions(env, userId, found);
  return stillOpen(found);
}

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

  await storeSubscriptions(env, userId, found);
  return stillOpen(found);
}

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

export function upsertStripeCustomer(db: Db, userId: string, stripeCustomerId: string, nowIso: string) {
  return insertStripeCustomer(db, userId, stripeCustomerId, nowIso).onConflictDoUpdate({
    target: schema.stripe_customers.user_id,
    set: { stripe_customer_id: stripeCustomerId, updated_at: nowIso },
  });
}

export function linkStripeCustomerIfUnmapped(db: Db, userId: string, stripeCustomerId: string, nowIso: string) {
  return insertStripeCustomer(db, userId, stripeCustomerId, nowIso).onConflictDoNothing();
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

  const transitionStripeCanMake = sql`${stripe_subscriptions.status} NOT IN ('canceled', 'incomplete_expired')
    AND (excluded.status <> 'incomplete' OR ${stripe_subscriptions.status} = 'incomplete')`;

  return db
    .insert(stripe_subscriptions)
    .values({ stripe_subscription_id: subscription.id, ...state, created_at: nowIso })
    .onConflictDoUpdate({
      target: stripe_subscriptions.stripe_subscription_id,
      set: state,
      setWhere: transitionStripeCanMake,
    });
}

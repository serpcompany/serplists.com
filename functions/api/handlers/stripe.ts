import type { BatchItem } from "drizzle-orm/batch";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { describeErrorForLog, log } from "../utils/logger";
import { json, jsonError } from "../utils/response";
import { assertStripeWebhookConfigured, expandableStripeIdSchema, verifyStripeWebhookSignature } from "../utils/stripe";
import {
  isTerminalSubscriptionStatus,
  linkStripeCustomerIfUnmapped,
  loadCurrentSubscription,
  parseSubscriptionSnapshot,
  retrieveSubscription,
  type SubscriptionSnapshot,
  upsertStripeCustomer,
  upsertStripeSubscription,
} from "../utils/stripe-subscriptions";
import {
  isStripeEventHandled,
  markStripeEventHandled,
  recordStripeEventFailure,
  type StripeEventRecord,
} from "../utils/stripe-webhook-events";

type Db = ReturnType<typeof createDb>;

const stripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  created: z.number().optional(),
  livemode: z.boolean().optional(),
  data: z.object({ object: z.unknown() }).optional(),
});
type StripeEvent = z.infer<typeof stripeEventSchema>;

const checkoutSessionSchema = z.object({
  client_reference_id: z.string().nullish(),
  customer: z.string().nullish(),
  mode: z.string().nullish(),
  subscription: expandableStripeIdSchema.nullish(),
  metadata: z.object({ userId: z.string().nullish() }).passthrough().nullish(),
});
type CheckoutSession = z.infer<typeof checkoutSessionSchema>;

const SUBSCRIPTION_EVENT_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function checkoutUserId(session: CheckoutSession): string | null {
  return session.client_reference_id ?? (session.metadata?.userId || null);
}

function logSkippedEvent(event: StripeEvent, reason: string): BatchItem<"sqlite">[] {
  log("info", "stripe_webhook_event_skipped", { eventId: event.id, type: event.type, reason });
  return [];
}

async function userExists(db: Db, userId: string): Promise<boolean> {
  const { users } = schema;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return row !== undefined;
}

async function subscriptionWrites(
  db: Db,
  event: StripeEvent,
  userId: string,
  subscription: SubscriptionSnapshot,
  nowIso: string,
): Promise<BatchItem<"sqlite">[]> {
  if (!(await userExists(db, userId))) return logSkippedEvent(event, "user_deleted");
  const linkCustomer = isTerminalSubscriptionStatus(subscription.status)
    ? linkStripeCustomerIfUnmapped
    : upsertStripeCustomer;
  return [
    linkCustomer(db, userId, subscription.customerId, nowIso),
    upsertStripeSubscription(db, userId, subscription, nowIso),
  ];
}

async function loadCheckoutSubscription(
  env: Env,
  event: StripeEvent,
  session: CheckoutSession,
): Promise<SubscriptionSnapshot | null> {
  if (session.mode !== "subscription") return null;
  const subscriptionId = session.subscription;
  if (!subscriptionId) return null;
  if (!env.STRIPE_SECRET_KEY) {
    logSkippedEvent(event, "subscription_read_needs_secret_key");
    return null;
  }
  return retrieveSubscription(env.STRIPE_SECRET_KEY, subscriptionId);
}

async function buildEventWrites(env: Env, db: Db, event: StripeEvent, nowIso: string): Promise<BatchItem<"sqlite">[]> {
  const object = event.data?.object;

  if (event.type === "checkout.session.completed") {
    const parsedSession = checkoutSessionSchema.safeParse(object);
    if (!parsedSession.success) return logSkippedEvent(event, "invalid_checkout_session");
    const session = parsedSession.data;
    const userId = checkoutUserId(session);
    const stripeCustomerId = session.customer ?? null;
    if (!userId || !stripeCustomerId) return logSkippedEvent(event, "missing_user_or_customer");
    const subscription = await loadCheckoutSubscription(env, event, session);
    if (subscription) return subscriptionWrites(db, event, userId, subscription, nowIso);
    return [upsertStripeCustomer(db, userId, stripeCustomerId, nowIso)];
  }

  if (!SUBSCRIPTION_EVENT_TYPES.has(event.type)) return [];

  const eventSnapshot = parseSubscriptionSnapshot(object);
  if (!eventSnapshot) return logSkippedEvent(event, "invalid_subscription");

  const { stripeCustomers } = schema;
  const [row] = await db
    .select({ user_id: stripeCustomers.user_id })
    .from(stripeCustomers)
    .where(eq(stripeCustomers.stripe_customer_id, eventSnapshot.customerId))
    .limit(1);
  const userId = row?.user_id ?? eventSnapshot.metadataUserId;
  if (!userId) return logSkippedEvent(event, "unknown_user");

  const subscription = await loadCurrentSubscription(env, eventSnapshot);
  if (!subscription) return [];
  return subscriptionWrites(db, event, userId, subscription, nowIso);
}

export async function handleStripe(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const stripeSubpath = pathParts.slice(2);

  if (request.method === "POST" && stripeSubpath[0] === "webhook") {
    const { webhookSecret } = assertStripeWebhookConfigured(env);
    const payload = await request.text();

    const verification = await verifyStripeWebhookSignature({
      payload,
      signatureHeader: request.headers.get("Stripe-Signature"),
      webhookSecret,
    });

    if (!verification.ok) {
      return jsonError(`Webhook signature verification failed: ${verification.error}`, 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(payload);
    } catch {
      return jsonError("Invalid JSON payload", 400);
    }

    const parsedEvent = stripeEventSchema.safeParse(body);
    if (!parsedEvent.success) {
      return jsonError("Invalid Stripe event payload", 400);
    }
    const event = parsedEvent.data;

    const db = createDb(env);
    const record: StripeEventRecord = {
      id: event.id,
      type: event.type,
      created: event.created ?? verification.timestamp,
      livemode: event.livemode ?? false,
      processedAt: new Date().toISOString(),
    };

    try {
      if (await isStripeEventHandled(db, event.id)) {
        return json({ received: true, duplicate: true });
      }

      const writes = await buildEventWrites(env, db, event, record.processedAt);
      await db.batch([markStripeEventHandled(db, record), ...writes]);
      return json({ received: true });
    } catch (err) {
      const described = describeErrorForLog(err);
      log("error", "stripe_webhook_failed", { eventId: event.id, type: event.type, ...described });
      try {
        await recordStripeEventFailure(db, record, described.errorMessage);
      } catch {
        log("warn", "stripe_webhook_failure_not_recorded", { eventId: event.id, type: event.type });
      }
      return jsonError("Stripe webhook processing failed", 500);
    }
  }

  return jsonError("Not Found", 404);
}

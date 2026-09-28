import type { BatchItem } from "drizzle-orm/batch";
import { eq } from "drizzle-orm";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { log } from "../utils/logger";
import { json, jsonError } from "../utils/response";
import { assertStripeWebhookConfigured, verifyStripeWebhookSignature } from "../utils/stripe";
import {
  loadCurrentSubscription,
  parseSubscriptionSnapshot,
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

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: { object: unknown };
};

const SUBSCRIPTION_EVENT_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getEventUserIdFallback(obj: Record<string, unknown> | null): string | null {
  const metadata = obj && isRecord(obj.metadata) ? obj.metadata : null;
  const fromMetadata = metadata?.userId;
  if (typeof fromMetadata === "string" && fromMetadata.length > 0) return fromMetadata;
  return null;
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

/** Reads what the event needs and returns its writes, unexecuted. */
async function buildEventWrites(env: Env, db: Db, event: StripeEvent, nowIso: string): Promise<BatchItem<"sqlite">[]> {
  const object = isRecord(event.data?.object) ? (event.data.object as Record<string, unknown>) : null;

  if (event.type === "checkout.session.completed") {
    const userId = typeof object?.client_reference_id === "string"
      ? object.client_reference_id
      : getEventUserIdFallback(object);
    const stripeCustomerId = typeof object?.customer === "string" ? object.customer : null;
    if (!userId || !stripeCustomerId) return logSkippedEvent(event, "missing_user_or_customer");
    return [upsertStripeCustomer(db, userId, stripeCustomerId, nowIso)];
  }

  if (!SUBSCRIPTION_EVENT_TYPES.has(event.type)) return [];

  const eventSnapshot = parseSubscriptionSnapshot(object);
  if (!eventSnapshot) return logSkippedEvent(event, "invalid_subscription");

  const { stripe_customers } = schema;
  const [row] = await db
    .select({ user_id: stripe_customers.user_id })
    .from(stripe_customers)
    .where(eq(stripe_customers.stripe_customer_id, eventSnapshot.customerId))
    .limit(1);
  const userId = row?.user_id ?? eventSnapshot.metadataUserId;
  if (!userId) return logSkippedEvent(event, "unknown_user");
  // A deleted user's subscription row would fail its foreign key on every retry.
  if (!(await userExists(db, userId))) return logSkippedEvent(event, "user_deleted");

  // The event snapshot may be older than state already stored, so write what
  // Stripe reports now (see loadCurrentSubscription).
  const subscription = await loadCurrentSubscription(env, eventSnapshot);
  if (!subscription) return [];
  return [
    upsertStripeCustomer(db, userId, subscription.customerId, nowIso),
    upsertStripeSubscription(db, userId, subscription, nowIso),
  ];
}

export async function handleStripe(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean); // ["api", "stripe", ...]
  const stripeSubpath = pathParts.slice(2); // after /api/stripe

  // Webhook: POST /api/stripe/webhook
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

    let event: StripeEvent;
    try {
      event = JSON.parse(payload) as StripeEvent;
    } catch {
      return jsonError("Invalid JSON payload", 400);
    }

    if (!event?.id || !event?.type) {
      return jsonError("Invalid Stripe event payload", 400);
    }

    const db = createDb(env);
    const record: StripeEventRecord = {
      id: event.id,
      type: event.type,
      created: event.created ?? verification.timestamp,
      livemode: Boolean(event.livemode),
      processedAt: new Date().toISOString(),
    };

    try {
      // Idempotency: a replay of an event whose writes committed changes nothing.
      if (await isStripeEventHandled(db, event.id)) {
        return json({ received: true, duplicate: true });
      }

      const writes = await buildEventWrites(env, db, event, record.processedAt);
      // D1 runs a batch as one transaction, so the event is recorded as handled only
      // together with its writes. Concurrent deliveries may both get here; the writes
      // are idempotent upserts.
      await db.batch([markStripeEventHandled(db, record), ...writes]);
      return json({ received: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("error", "stripe_webhook_failed", { eventId: event.id, type: event.type, error: message });
      try {
        await recordStripeEventFailure(db, record, message);
      } catch {
        // Without an error row the event is still unhandled, so Stripe's retry reprocesses it.
        log("warn", "stripe_webhook_failure_not_recorded", { eventId: event.id, type: event.type });
      }
      return jsonError("Stripe webhook processing failed", 500);
    }
  }

  return jsonError("Not Found", 404);
}

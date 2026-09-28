import type { Env } from "../types";
import { createDb, schema } from "../db";
import { json, jsonError } from "../utils/response";
import { assertStripeWebhookConfigured, verifyStripeWebhookSignature } from "../utils/stripe";
import {
  loadCurrentSubscription,
  parseSubscriptionSnapshot,
  upsertStripeCustomer,
  upsertStripeSubscription,
} from "../utils/stripe-subscriptions";
import { eq } from "drizzle-orm";

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: { object: unknown };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getEventUserIdFallback(obj: Record<string, unknown> | null): string | null {
  const metadata = obj && isRecord(obj.metadata) ? obj.metadata : null;
  const fromMetadata = metadata?.userId;
  if (typeof fromMetadata === "string" && fromMetadata.length > 0) return fromMetadata;
  return null;
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
    const { stripe_webhook_events, stripe_customers } = schema;
    const nowIso = new Date().toISOString();
    let shouldRefreshProcessedEvent = false;

    // Idempotency: insert event id once; ignore duplicates.
    try {
      await db.insert(stripe_webhook_events).values({
        id: event.id,
        type: event.type,
        created: event.created ?? verification.timestamp,
        livemode: Boolean(event.livemode),
        processed_at: nowIso,
        error: null,
      });
    } catch {
      const [existingEvent] = await db
        .select({ error: stripe_webhook_events.error })
        .from(stripe_webhook_events)
        .where(eq(stripe_webhook_events.id, event.id))
        .limit(1);

      if (!existingEvent || existingEvent.error === null) {
        return json({ received: true, duplicate: true });
      }

      shouldRefreshProcessedEvent = true;
    }

    const object = isRecord(event.data?.object) ? (event.data.object as Record<string, unknown>) : null;

    try {
      if (event.type === "checkout.session.completed") {
        const userId = typeof object?.client_reference_id === "string"
          ? object.client_reference_id
          : getEventUserIdFallback(object);
        const stripeCustomerId = typeof object?.customer === "string" ? object.customer : null;
        if (userId && stripeCustomerId) {
          await upsertStripeCustomer(db, userId, stripeCustomerId, nowIso);
        }
      }

      if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        const eventSnapshot = parseSubscriptionSnapshot(object);

        let userId: string | null = null;
        if (eventSnapshot) {
          const [row] = await db
            .select({ user_id: stripe_customers.user_id })
            .from(stripe_customers)
            .where(eq(stripe_customers.stripe_customer_id, eventSnapshot.customerId))
            .limit(1);
          userId = row?.user_id ?? eventSnapshot.metadataUserId;
        }

        // The event snapshot may be older than state already stored, so write what
        // Stripe reports now (see loadCurrentSubscription).
        const subscription = eventSnapshot && userId ? await loadCurrentSubscription(env, eventSnapshot) : null;
        if (subscription && userId) {
          await upsertStripeCustomer(db, userId, subscription.customerId, nowIso);
          await upsertStripeSubscription(db, userId, subscription, nowIso);
        }
      }

      if (shouldRefreshProcessedEvent) {
        await db
          .update(stripe_webhook_events)
          .set({ error: null, processed_at: nowIso })
          .where(eq(stripe_webhook_events.id, event.id));
      }

      return json({ received: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await db.update(stripe_webhook_events).set({ error: message }).where(eq(stripe_webhook_events.id, event.id));
      } catch {
        // ignore
      }
      return jsonError("Stripe webhook processing failed", 500);
    }
  }

  return jsonError("Not Found", 404);
}

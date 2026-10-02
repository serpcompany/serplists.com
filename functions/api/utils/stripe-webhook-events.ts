import { eq, isNotNull } from "drizzle-orm";
import { createDb, schema } from "../db";

type Db = ReturnType<typeof createDb>;

export type StripeEventRecord = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  processedAt: string;
};

function eventRow(record: StripeEventRecord, error: string | null) {
  return {
    id: record.id,
    type: record.type,
    created: record.created,
    livemode: record.livemode,
    processed_at: record.processedAt,
    error,
  };
}

export async function isStripeEventHandled(db: Db, eventId: string): Promise<boolean> {
  const { stripeWebhookEvents } = schema;
  const [row] = await db
    .select({ error: stripeWebhookEvents.error })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.id, eventId))
    .limit(1);
  return row !== undefined && row.error === null;
}

export function markStripeEventHandled(db: Db, record: StripeEventRecord) {
  const { stripeWebhookEvents } = schema;
  return db
    .insert(stripeWebhookEvents)
    .values(eventRow(record, null))
    .onConflictDoUpdate({
      target: stripeWebhookEvents.id,
      set: { error: null, processed_at: record.processedAt },
    });
}

export async function recordStripeEventFailure(db: Db, record: StripeEventRecord, message: string) {
  const { stripeWebhookEvents } = schema;
  await db
    .insert(stripeWebhookEvents)
    .values(eventRow(record, message))
    .onConflictDoUpdate({
      target: stripeWebhookEvents.id,
      set: { error: message },
      setWhere: isNotNull(stripeWebhookEvents.error),
    });
}

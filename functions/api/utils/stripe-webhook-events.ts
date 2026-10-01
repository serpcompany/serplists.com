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
  const { stripe_webhook_events } = schema;
  const [row] = await db
    .select({ error: stripe_webhook_events.error })
    .from(stripe_webhook_events)
    .where(eq(stripe_webhook_events.id, eventId))
    .limit(1);
  return row !== undefined && row.error === null;
}

export function markStripeEventHandled(db: Db, record: StripeEventRecord) {
  const { stripe_webhook_events } = schema;
  return db
    .insert(stripe_webhook_events)
    .values(eventRow(record, null))
    .onConflictDoUpdate({
      target: stripe_webhook_events.id,
      set: { error: null, processed_at: record.processedAt },
    });
}

export async function recordStripeEventFailure(db: Db, record: StripeEventRecord, message: string) {
  const { stripe_webhook_events } = schema;
  await db
    .insert(stripe_webhook_events)
    .values(eventRow(record, message))
    .onConflictDoUpdate({
      target: stripe_webhook_events.id,
      set: { error: message },
      setWhere: isNotNull(stripe_webhook_events.error),
    });
}

import { eq, isNotNull } from "drizzle-orm";
import { createDb, schema } from "../db";

type Db = ReturnType<typeof createDb>;

// A stripe_webhook_events row with no error records an event whose writes committed.
// The row is written in the same D1 batch as those writes, never before them, so a
// failed write, a lost error record, or a Worker stopped mid-delivery leaves the event
// retryable instead of looking handled.

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

/** True when a previous delivery of the event committed its writes (primary-key read). */
export async function isStripeEventHandled(db: Db, eventId: string): Promise<boolean> {
  const { stripe_webhook_events } = schema;
  const [row] = await db
    .select({ error: stripe_webhook_events.error })
    .from(stripe_webhook_events)
    .where(eq(stripe_webhook_events.id, eventId))
    .limit(1);
  return row !== undefined && row.error === null;
}

/** The statement marking the event handled. Batch it with the event's writes. */
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

/**
 * Records a processing error. It never overwrites a row a concurrent delivery already
 * marked handled. Callers treat it as best effort: without a row the retry still runs.
 */
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

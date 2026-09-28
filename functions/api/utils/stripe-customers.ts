import { and, eq } from "drizzle-orm";
import { createDb, schema } from "../db";
import { log } from "./logger";
import { stripePostForm } from "./stripe";

type Db = ReturnType<typeof createDb>;

/**
 * Creates a Stripe customer for the user and returns its id. With an idempotency key,
 * a repeated call (a double click) returns the same customer instead of a second one.
 */
export async function createStripeCustomer(
  db: Db,
  secretKey: string,
  userId: string,
  idempotencyKey?: string,
): Promise<string> {
  const { users } = schema;
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const customer = await stripePostForm<{ id: string }>(
    secretKey,
    "/v1/customers",
    { email: user?.email ?? undefined, "metadata[userId]": userId },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
  return customer.id;
}

/**
 * Replaces a stored customer that Stripe no longer has (deleted, or created with the
 * other mode's keys) and returns the customer id to use. Only the mapping that still
 * points at the missing customer is changed, so a concurrent repair is not overwritten.
 */
export async function replaceMissingStripeCustomer(
  db: Db,
  secretKey: string,
  userId: string,
  missingCustomerId: string,
): Promise<string> {
  const { stripe_customers } = schema;
  const replacement = await createStripeCustomer(db, secretKey, userId, `customer-${userId}-replaces-${missingCustomerId}`);
  await db
    .update(stripe_customers)
    .set({ stripe_customer_id: replacement, updated_at: new Date().toISOString() })
    .where(and(eq(stripe_customers.user_id, userId), eq(stripe_customers.stripe_customer_id, missingCustomerId)));
  log("warn", "stripe_customer_replaced", { userId, missingCustomerId, stripeCustomerId: replacement });

  const [row] = await db
    .select({ stripeCustomerId: stripe_customers.stripe_customer_id })
    .from(stripe_customers)
    .where(eq(stripe_customers.user_id, userId))
    .limit(1);
  return row?.stripeCustomerId ?? replacement;
}

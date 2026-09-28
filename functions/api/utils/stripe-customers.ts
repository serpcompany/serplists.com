import { and, eq } from "drizzle-orm";
import { createDb, schema } from "../db";
import { log } from "./logger";
import { shortDigest, stripePostForm } from "./stripe";

type Db = ReturnType<typeof createDb>;

/**
 * Creates a Stripe customer for the user and returns its id. The idempotency key is
 * `keyPrefix` plus a digest of the email, so a repeated call (a double click, or a retry
 * after a failed D1 write) returns the same customer instead of a second one, and a
 * changed email makes a new key rather than a Stripe parameter-mismatch error.
 */
export async function createStripeCustomer(
  db: Db,
  secretKey: string,
  userId: string,
  keyPrefix: string,
): Promise<string> {
  const { users } = schema;
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const email = user?.email ?? undefined;
  const customer = await stripePostForm<{ id: string }>(
    secretKey,
    "/v1/customers",
    { email, "metadata[userId]": userId },
    { idempotencyKey: `${keyPrefix}-${await shortDigest(email ?? "")}` },
  );
  return customer.id;
}

/**
 * Stores the user's first Stripe customer unless a mapping already exists, and returns
 * the stored id. It differs from `stripeCustomerId` only when another request (or the
 * webhook) stored a customer first: that mapping is kept, never overwritten.
 */
export async function storeFirstStripeCustomer(db: Db, userId: string, stripeCustomerId: string): Promise<string> {
  const { stripe_customers } = schema;
  const nowIso = new Date().toISOString();
  await db
    .insert(stripe_customers)
    .values({ user_id: userId, stripe_customer_id: stripeCustomerId, created_at: nowIso, updated_at: nowIso })
    .onConflictDoNothing({ target: stripe_customers.user_id });

  const [row] = await db
    .select({ stripeCustomerId: stripe_customers.stripe_customer_id })
    .from(stripe_customers)
    .where(eq(stripe_customers.user_id, userId))
    .limit(1);
  return row?.stripeCustomerId ?? stripeCustomerId;
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

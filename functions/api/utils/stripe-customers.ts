import { and, eq } from "drizzle-orm";
import { createDb, schema } from "../db";
import { log } from "./logger";
import { shortDigest, stripeObjectSchema, stripePostForm } from "./stripe";

type Db = ReturnType<typeof createDb>;

export async function createStripeCustomer(
  db: Db,
  secretKey: string,
  userId: string,
  keyPrefix: string,
): Promise<string> {
  const { users } = schema;
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const email = user?.email ?? undefined;
  const customer = await stripePostForm(
    secretKey,
    "/v1/customers",
    { email, "metadata[userId]": userId },
    stripeObjectSchema,
    { idempotencyKey: `${keyPrefix}-${await shortDigest(email ?? "")}` },
  );
  return customer.id;
}

export function insertStripeCustomer(db: Db, userId: string, stripeCustomerId: string, nowIso: string) {
  return db
    .insert(schema.stripe_customers)
    .values({ user_id: userId, stripe_customer_id: stripeCustomerId, created_at: nowIso, updated_at: nowIso });
}

async function storedStripeCustomerId(db: Db, userId: string): Promise<string | undefined> {
  const { stripe_customers } = schema;
  const [row] = await db
    .select({ stripeCustomerId: stripe_customers.stripe_customer_id })
    .from(stripe_customers)
    .where(eq(stripe_customers.user_id, userId))
    .limit(1);
  return row?.stripeCustomerId;
}

export async function storeFirstStripeCustomer(db: Db, userId: string, stripeCustomerId: string): Promise<string> {
  await insertStripeCustomer(db, userId, stripeCustomerId, new Date().toISOString()).onConflictDoNothing({
    target: schema.stripe_customers.user_id,
  });
  return (await storedStripeCustomerId(db, userId)) ?? stripeCustomerId;
}

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
  return (await storedStripeCustomerId(db, userId)) ?? replacement;
}

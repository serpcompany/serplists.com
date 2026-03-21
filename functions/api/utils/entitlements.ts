import type { Env } from "../types";
import { createDb, schema } from "../db";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getStripeConfig } from "./stripe";

export type Plan = "free" | "pro";

export type Entitlements = {
  plan: Plan;
  limits: {
    maxTemplates: number | null;
    maxActiveRuns: number | null;
  };
};

const devProTestEmails = new Set(["admin@test.com", "jane@test.com"]);

function isProSubscriptionStatus(status: string): boolean {
  return status === "active" || status === "trialing";
}

export async function getEntitlementsForUser(env: Env, userId: string): Promise<Entitlements> {
  const stripe = getStripeConfig(env);
  const db = createDb(env);
  const { entitlement_overrides, users } = schema;
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Manual override takes priority (for comp/revoke / support).
  const [override] = await db
    .select()
    .from(entitlement_overrides)
    .where(
      and(
        eq(entitlement_overrides.user_id, userId),
        or(isNull(entitlement_overrides.expires_at), gt(entitlement_overrides.expires_at, nowSeconds))
      )
    )
    .limit(1);

  if (override) {
    const plan = override.plan === "pro" ? "pro" : "free";
    return plan === "pro"
      ? { plan, limits: { maxTemplates: null, maxActiveRuns: null } }
      : { plan, limits: { maxTemplates: 1, maxActiveRuns: 3 } };
  }

  // Keep local seeded personas aligned with their visible labels before a reseed.
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.email && devProTestEmails.has(user.email.toLowerCase())) {
    return { plan: "pro", limits: { maxTemplates: null, maxActiveRuns: null } };
  }

  if (!stripe) {
    return {
      plan: "free",
      limits: { maxTemplates: 1, maxActiveRuns: 3 },
    };
  }

  const { stripe_subscriptions } = schema;
  type StripeSubscriptionRow = typeof stripe_subscriptions.$inferSelect;

  const subs: StripeSubscriptionRow[] = await db
    .select()
    .from(stripe_subscriptions)
    .where(and(eq(stripe_subscriptions.user_id, userId), eq(stripe_subscriptions.price_id, stripe.proPriceId)))
    .orderBy(desc(stripe_subscriptions.updated_at));

  const best = subs.find((s) => isProSubscriptionStatus(s.status)) ?? subs[0] ?? null;
  const plan: Plan = best?.status && isProSubscriptionStatus(best.status) ? "pro" : "free";

  return plan === "pro"
    ? { plan, limits: { maxTemplates: null, maxActiveRuns: null } }
    : { plan, limits: { maxTemplates: 1, maxActiveRuns: 3 } };
}

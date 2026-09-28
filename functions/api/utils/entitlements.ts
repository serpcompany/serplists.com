import type { Env } from "../types";
import { createDb, schema } from "../db";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { getStripeBillingConfig } from "./stripe";

export type Plan = "free" | "pro" | "team";

export type EntitlementContext =
  | { type: "user"; userId: string }
  | { type: "team"; teamId: string; userId?: string };

export type EntitlementSource =
  | "free"
  | "user_override"
  | "team_override"
  | "user_subscription"
  | "dev_test_user";

export type Entitlements = {
  plan: Plan;
  source?: EntitlementSource;
  limits: {
    maxTemplates: number | null;
    maxActiveRuns: number | null;
  };
};

const devProTestEmails = new Set(["admin@test.com", "jane@test.com"]);

function isProSubscriptionStatus(status: string): boolean {
  return status === "active" || status === "trialing";
}

function isMissingOptionalBillingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table: (entitlement_overrides|team_entitlement_overrides|stripe_subscriptions)/i.test(message);
}

function freeEntitlements(): Entitlements {
  return {
    plan: "free",
    source: "free",
    limits: { maxTemplates: 1, maxActiveRuns: 3 },
  };
}

function paidEntitlements(plan: "pro" | "team", source: EntitlementSource): Entitlements {
  return {
    plan,
    source,
    limits: { maxTemplates: null, maxActiveRuns: null },
  };
}

// A Free override keeps source "user_override" so billing can tell that support set
// the plan and refuse a self-serve checkout that the override would hide.
function userOverrideEntitlements(plan: string): Entitlements {
  return plan === "pro" ? paidEntitlements("pro", "user_override") : { ...freeEntitlements(), source: "user_override" };
}

function teamOverrideEntitlements(plan: string): Entitlements {
  if (plan === "team") return paidEntitlements("team", "team_override");
  if (plan === "pro") return paidEntitlements("team", "team_override");
  return freeEntitlements();
}

export async function getEntitlementsForUser(env: Env, userId: string): Promise<Entitlements> {
  const stripe = getStripeBillingConfig(env);
  const db = createDb(env);
  const { entitlement_overrides, users } = schema;
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Manual override takes priority (for comp/revoke / support).
  let override: typeof entitlement_overrides.$inferSelect | undefined;
  try {
    [override] = await db
      .select()
      .from(entitlement_overrides)
      .where(
        and(
          eq(entitlement_overrides.user_id, userId),
          or(isNull(entitlement_overrides.expires_at), gt(entitlement_overrides.expires_at, nowSeconds))
        )
      )
      .limit(1);
  } catch (error) {
    if (!isMissingOptionalBillingTableError(error)) {
      throw error;
    }
  }

  if (override) {
    return userOverrideEntitlements(override.plan);
  }

  // Keep local seeded personas aligned with their visible labels before a reseed.
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.email && devProTestEmails.has(user.email.toLowerCase())) {
    return paidEntitlements("pro", "dev_test_user");
  }

  if (!stripe) {
    return freeEntitlements();
  }

  const { stripe_subscriptions } = schema;
  type StripeSubscriptionRow = typeof stripe_subscriptions.$inferSelect;

  let subs: StripeSubscriptionRow[];
  try {
    subs = await db
      .select()
      .from(stripe_subscriptions)
      .where(and(eq(stripe_subscriptions.user_id, userId), inArray(stripe_subscriptions.price_id, stripe.proPriceIds)))
      .orderBy(desc(stripe_subscriptions.updated_at));
  } catch (error) {
    if (!isMissingOptionalBillingTableError(error)) {
      throw error;
    }

    return freeEntitlements();
  }

  const best = subs.find((s) => isProSubscriptionStatus(s.status)) ?? subs[0] ?? null;
  const plan = best?.status && isProSubscriptionStatus(best.status) ? "pro" : "free";

  return plan === "pro"
    ? paidEntitlements("pro", "user_subscription")
    : freeEntitlements();
}

export async function getEntitlementsForContext(env: Env, context: EntitlementContext): Promise<Entitlements> {
  if (context.type === "user") {
    return getEntitlementsForUser(env, context.userId);
  }

  const db = createDb(env);
  const { team_entitlement_overrides } = schema;
  const nowSeconds = Math.floor(Date.now() / 1000);

  try {
    const [override] = await db
      .select()
      .from(team_entitlement_overrides)
      .where(
        and(
          eq(team_entitlement_overrides.team_id, context.teamId),
          or(isNull(team_entitlement_overrides.expires_at), gt(team_entitlement_overrides.expires_at, nowSeconds))
        )
      )
      .limit(1);

    if (override) {
      return teamOverrideEntitlements(override.plan);
    }
  } catch (error) {
    if (!isMissingOptionalBillingTableError(error)) {
      throw error;
    }
  }

  return freeEntitlements();
}

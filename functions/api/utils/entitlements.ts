import type { Env } from "../types";
import { createDb, schema } from "../db";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { getStripeBillingConfig } from "./stripe";
import { isPaidSubscriptionStatus } from "./stripe-subscriptions";

type Plan = "free" | "pro" | "team";

export type EntitlementContext =
  | { type: "user"; userId: string }
  | { type: "team"; teamId: string; userId?: string };

type EntitlementSource =
  | "free"
  | "user_override"
  | "team_override"
  | "user_subscription";

export type Entitlements = {
  plan: Plan;
  source?: EntitlementSource;
  limits: {
    maxTemplates: number | null;
    maxActiveRuns: number | null;
  };
};

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

function userOverrideEntitlements(plan: string): Entitlements {
  return plan === "pro" ? paidEntitlements("pro", "user_override") : { ...freeEntitlements(), source: "user_override" };
}

function teamOverrideEntitlements(plan: string): Entitlements {
  return plan === "team" || plan === "pro" ? paidEntitlements("team", "team_override") : freeEntitlements();
}

type Db = ReturnType<typeof createDb>;

async function findActiveManualOverride(db: Db, userId: string, nowSeconds: number) {
  const { entitlementOverrides } = schema;
  const [override] = await db
    .select()
    .from(entitlementOverrides)
    .where(
      and(
        eq(entitlementOverrides.user_id, userId),
        or(isNull(entitlementOverrides.expires_at), gt(entitlementOverrides.expires_at, nowSeconds))
      )
    )
    .limit(1);
  return override;
}

export async function getEntitlementsForUser(env: Env, userId: string): Promise<Entitlements> {
  const stripe = getStripeBillingConfig(env);
  const db = createDb(env);
  const nowSeconds = Math.floor(Date.now() / 1000);

  const manualOverride = await findActiveManualOverride(db, userId, nowSeconds);
  if (manualOverride) {
    return userOverrideEntitlements(manualOverride.plan);
  }

  if (!stripe) {
    return freeEntitlements();
  }

  const { stripeSubscriptions } = schema;
  const subs = await db
    .select()
    .from(stripeSubscriptions)
    .where(and(eq(stripeSubscriptions.user_id, userId), inArray(stripeSubscriptions.price_id, stripe.proPriceIds)))
    .orderBy(desc(stripeSubscriptions.updated_at));

  return subs.some((s) => isPaidSubscriptionStatus(s.status))
    ? paidEntitlements("pro", "user_subscription")
    : freeEntitlements();
}

export async function getEntitlementsForContext(env: Env, context: EntitlementContext): Promise<Entitlements> {
  if (context.type === "user") {
    return getEntitlementsForUser(env, context.userId);
  }

  const db = createDb(env);
  const { teamEntitlementOverrides } = schema;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const [override] = await db
    .select()
    .from(teamEntitlementOverrides)
    .where(
      and(
        eq(teamEntitlementOverrides.team_id, context.teamId),
        or(isNull(teamEntitlementOverrides.expires_at), gt(teamEntitlementOverrides.expires_at, nowSeconds))
      )
    )
    .limit(1);

  return override ? teamOverrideEntitlements(override.plan) : freeEntitlements();
}

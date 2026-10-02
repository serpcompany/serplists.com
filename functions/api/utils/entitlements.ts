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

function userOverrideEntitlements(plan: string): Entitlements {
  return plan === "pro" ? paidEntitlements("pro", "user_override") : { ...freeEntitlements(), source: "user_override" };
}

function teamOverrideEntitlements(plan: string): Entitlements {
  if (plan === "team") return paidEntitlements("team", "team_override");
  if (plan === "pro") return paidEntitlements("team", "team_override");
  return freeEntitlements();
}

type Db = ReturnType<typeof createDb>;

async function findActiveManualOverride(db: Db, userId: string, nowSeconds: number) {
  const { entitlementOverrides } = schema;
  try {
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
  } catch (error) {
    if (!isMissingOptionalBillingTableError(error)) {
      throw error;
    }
    return undefined;
  }
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
  type StripeSubscriptionRow = typeof stripeSubscriptions.$inferSelect;

  let subs: StripeSubscriptionRow[];
  try {
    subs = await db
      .select()
      .from(stripeSubscriptions)
      .where(and(eq(stripeSubscriptions.user_id, userId), inArray(stripeSubscriptions.price_id, stripe.proPriceIds)))
      .orderBy(desc(stripeSubscriptions.updated_at));
  } catch (error) {
    if (!isMissingOptionalBillingTableError(error)) {
      throw error;
    }

    return freeEntitlements();
  }

  const best = subs.find((s) => isPaidSubscriptionStatus(s.status)) ?? subs[0] ?? null;
  const plan = best?.status && isPaidSubscriptionStatus(best.status) ? "pro" : "free";

  return plan === "pro"
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

  try {
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

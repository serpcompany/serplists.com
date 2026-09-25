import type { Env } from "../types";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";
import { json, jsonError } from "../utils/response";
import { getStripeBillingConfig, stripePostForm } from "../utils/stripe";
import { getSessionUserId } from "../utils/session";
import { getEntitlementsForContext, getEntitlementsForUser } from "../utils/entitlements";
import { canViewTeam, getActiveTeamMembership, normalizeTeamRole } from "../utils/team-access";

type StripeCustomer = { id: string };
type StripeCheckoutSession = { id: string; url: string | null };
type StripePortalSession = { id: string; url: string };

function getAppOrigin(request: Request, env: Env): string {
  if (env.FRONTEND_URL) {
    try {
      return new URL(env.FRONTEND_URL).origin;
    } catch {
      // ignore
    }
  }
  return new URL(request.url).origin;
}

export async function handleBilling(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean); // ["api", "billing", ...]
  const billingSubpath = pathParts.slice(2); // after /api/billing

  const userId = await getSessionUserId(request, env);
  if (!userId) return jsonError("Unauthorized", 401);

  const origin = getAppOrigin(request, env);

  if (request.method === "GET" && billingSubpath[0] === "status") {
    const teamId = url.searchParams.get("teamId");

    if (teamId) {
      const membership = await getActiveTeamMembership(env, teamId, userId);
      if (!membership || !canViewTeam(normalizeTeamRole(membership.role))) {
        return jsonError("Team not found", 404);
      }
    }

    const entitlements = teamId
      ? await getEntitlementsForContext(env, { type: "team", teamId, userId })
      : await getEntitlementsForUser(env, userId);
    return json({
      plan: entitlements.plan,
      limits: entitlements.limits,
      billingEnabled: Boolean(getStripeBillingConfig(env)),
    });
  }

  if (request.method === "POST" && billingSubpath[0] === "checkout") {
    const stripe = getStripeBillingConfig(env);
    if (!stripe) {
      return jsonError("Billing is temporarily unavailable. Please contact support.", 503, {
        code: "billing_unavailable",
      });
    }
    const { secretKey, proPriceId } = stripe;
    const entitlements = await getEntitlementsForUser(env, userId);
    if (entitlements.plan === "pro") {
      return jsonError("You already have Pro. Manage your subscription from Billing.", 409, {
        code: "already_subscribed",
      });
    }

    const nowIso = new Date().toISOString();
    const db = createDb(env);
    const { stripe_customers, users } = schema;

    const [existingCustomer] = await db
      .select()
      .from(stripe_customers)
      .where(eq(stripe_customers.user_id, userId))
      .limit(1);

    let stripeCustomerId: string | null = existingCustomer?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      const email = user?.email;

      const customer = await stripePostForm<StripeCustomer>(secretKey, "/v1/customers", {
        email: email ?? undefined,
        "metadata[userId]": userId,
      });

      stripeCustomerId = customer.id;

      try {
        await db.insert(stripe_customers).values({
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          created_at: nowIso,
          updated_at: nowIso,
        });
      } catch {
        await db
          .update(stripe_customers)
          .set({ stripe_customer_id: stripeCustomerId, updated_at: nowIso })
          .where(eq(stripe_customers.user_id, userId));
      }
    }

    const successUrl = `${origin}/account?billing=success`;
    const cancelUrl = `${origin}/account?billing=cancel`;

    const session = await stripePostForm<StripeCheckoutSession>(
      secretKey,
      "/v1/checkout/sessions",
      {
        mode: "subscription",
        customer: stripeCustomerId,
        client_reference_id: userId,
        "line_items[0][price]": proPriceId,
        "line_items[0][quantity]": 1,
        success_url: successUrl,
        cancel_url: cancelUrl,
        "metadata[userId]": userId,
        "subscription_data[metadata][userId]": userId,
        allow_promotion_codes: true,
      },
      {
        // Reuse a Checkout Session when a client retries or double-submits in the
        // same five-minute window. A later attempt can still start a fresh session.
        idempotencyKey: `checkout-${userId}-${Math.floor(Date.now() / 300_000)}`,
      },
    );

    if (!session.url) return jsonError("Stripe session missing URL", 500);
    return json({ url: session.url });
  }

  if (request.method === "POST" && billingSubpath[0] === "portal") {
    const stripe = getStripeBillingConfig(env);
    if (!stripe) {
      return jsonError("Billing is temporarily unavailable. Please contact support.", 503, {
        code: "billing_unavailable",
      });
    }
    const { secretKey } = stripe;
    const db = createDb(env);
    const { stripe_customers } = schema;

    const [existingCustomer] = await db
      .select()
      .from(stripe_customers)
      .where(eq(stripe_customers.user_id, userId))
      .limit(1);

    if (!existingCustomer?.stripe_customer_id) {
      return jsonError("No Stripe customer found for user", 400);
    }

    const returnUrl = `${origin}/account`;
    const portal = await stripePostForm<StripePortalSession>(secretKey, "/v1/billing_portal/sessions", {
      customer: existingCustomer.stripe_customer_id,
      return_url: returnUrl,
      configuration: env.STRIPE_PORTAL_CONFIGURATION_ID,
    });

    return json({ url: portal.url });
  }

  return jsonError("Not Found", 404);
}

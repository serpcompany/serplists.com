import type { Env } from "../types";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";
import { json, jsonError } from "../utils/response";
import { getStripeBillingConfig, stripePostForm } from "../utils/stripe";
import { getSessionUserId } from "../utils/session";
import { checkRateLimit } from "../utils/rate-limit";
import { ROUTE_RATE_LIMIT_MESSAGES } from "../utils/route-rate-limit";
import { getEntitlementsForContext, getEntitlementsForUser } from "../utils/entitlements";
import { canViewTeam, getActiveTeamMembership, normalizeTeamRole } from "../utils/team-access";

type StripeCustomer = { id: string };
type StripeCheckoutSession = { id: string; url: string | null };
type StripePortalSession = { id: string; url: string };

// Checkout and portal each call Stripe, whose rate limit the whole account
// shares. The router limits them per IP; this limits each account, whatever IP
// it uses. Checked after authentication so anonymous requests cannot use it up.
const ACCOUNT_STRIPE_CALL_LIMIT = { windowMs: 60 * 1000, max: 10 };

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

  if (request.method === "POST" && (billingSubpath[0] === "checkout" || billingSubpath[0] === "portal")) {
    const limit = checkRateLimit(`billing-user:${userId}`, ACCOUNT_STRIPE_CALL_LIMIT);
    if (!limit.allowed) {
      const response = jsonError(ROUTE_RATE_LIMIT_MESSAGES.billing, 429);
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return response;
    }
  }

  const origin = getAppOrigin(request, env);

  if (request.method === "GET" && billingSubpath[0] === "status") {
    const teamId = url.searchParams.get("teamId");

    if (teamId) {
      const membership = await getActiveTeamMembership(env, teamId, userId);
      if (!membership || !canViewTeam(normalizeTeamRole(membership.role))) {
        return jsonError("Organization not found", 404);
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

    const findStoredCustomerId = async () => {
      const [existingCustomer] = await db
        .select()
        .from(stripe_customers)
        .where(eq(stripe_customers.user_id, userId))
        .limit(1);
      return existingCustomer?.stripe_customer_id ?? null;
    };

    let stripeCustomerId = await findStoredCustomerId();

    if (!stripeCustomerId) {
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      const email = user?.email;

      const customer = await stripePostForm<StripeCustomer>(
        secretKey,
        "/v1/customers",
        {
          email: email ?? undefined,
          "metadata[userId]": userId,
        },
        // Concurrent first checkouts (a double click) get the same customer back
        // for 24 hours instead of each creating one. After that the mapping exists.
        { idempotencyKey: `customer-${userId}` },
      );

      // Keep a customer another request or a webhook stored first, so every
      // request uses the same one.
      await db
        .insert(stripe_customers)
        .values({
          user_id: userId,
          stripe_customer_id: customer.id,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .onConflictDoNothing();
      stripeCustomerId = (await findStoredCustomerId()) ?? customer.id;
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

import type { Env } from "../types";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";
import { json, jsonError } from "../utils/response";
import {
  getStripeBillingConfig,
  isMissingStripeCustomer,
  isStripeIdempotencyConflict,
  shortDigest,
  stripePostForm,
} from "../utils/stripe";
import { createStripeCustomer, replaceMissingStripeCustomer, storeFirstStripeCustomer } from "../utils/stripe-customers";
import { getSessionUserId } from "../utils/session";
import { getEntitlementsForContext, getEntitlementsForUser } from "../utils/entitlements";
import { log } from "../utils/logger";
import {
  getPersonalSubscriptionSummary,
  isPaidSubscriptionStatus,
  syncCustomerSubscriptions,
} from "../utils/stripe-subscriptions";
import { canViewTeam, getActiveTeamMembership, normalizeTeamRole } from "../utils/team-access";

type StripeCheckoutSession = { id: string; url: string | null };
type StripePortalSession = { id: string; url: string };

// The SPA's settings page (buildConsoleSettingsPath() in src/lib/routes.ts, which the
// API cannot import). Stripe returns here directly: Billing reads ?billing= on it, and
// a redirecting legacy path such as /account could drop that query.
const SETTINGS_PATH = "/dashboard/settings";

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

function alreadySubscribed(): Response {
  return jsonError("You already have Pro. Manage your subscription from Billing.", 409, {
    code: "already_subscribed",
  });
}

function checkoutInProgress(): Response {
  return jsonError("Checkout is already starting. Try again in a moment.", 409, { code: "checkout_in_progress" });
}

function billingUnavailable(): Response {
  return jsonError("Billing is temporarily unavailable. Please contact support.", 503, {
    code: "billing_unavailable",
  });
}

/**
 * A subscription on any price, paid or not, blocks a second one: Stripe would bill
 * both, and a failed payment is fixed in the Customer Portal instead.
 */
function openSubscriptionConflict(openStatus: string | null): Response | null {
  if (!openStatus) return null;
  if (isPaidSubscriptionStatus(openStatus)) return alreadySubscribed();
  return jsonError(
    "Your Pro subscription needs attention. Update your payment method with Manage subscription in Billing.",
    409,
    { code: "subscription_needs_attention" },
  );
}

/** Starts a Personal Pro Checkout Session, or explains why the user cannot buy one. */
async function startCheckout(env: Env, userId: string, origin: string): Promise<Response> {
  const stripe = getStripeBillingConfig(env);
  if (!stripe) return billingUnavailable();
  const { secretKey, proPriceId } = stripe;
  const entitlements = await getEntitlementsForUser(env, userId);
  if (entitlements.plan === "pro") return alreadySubscribed();
  // A manual override outranks Stripe, so a subscription bought under a Free
  // override would be billed without ever granting Pro.
  if (entitlements.source === "user_override") {
    return jsonError("Your plan is managed by support. Contact support to change it.", 409, {
      code: "plan_managed_by_support",
    });
  }

  const { openStatus } = await getPersonalSubscriptionSummary(env, userId);
  const storedConflict = openSubscriptionConflict(openStatus);
  if (storedConflict) return storedConflict;

  const db = createDb(env);
  const { stripe_customers } = schema;

  const [existingCustomer] = await db
    .select()
    .from(stripe_customers)
    .where(eq(stripe_customers.user_id, userId))
    .limit(1);

  let stripeCustomerId: string;
  // A stored customer can be gone from Stripe (deleted, or from the other mode's keys).
  // It is replaced at most once per request, and only when Stripe says it is missing.
  let canReplaceCustomer = false;

  if (existingCustomer?.stripe_customer_id) {
    stripeCustomerId = existingCustomer.stripe_customer_id;
    canReplaceCustomer = true;
    // D1 learns about subscriptions from webhooks, which can lag or fail, so ask
    // Stripe too. Fail closed: a missed subscription would be billed twice.
    let stripeOpenStatus: string | null = null;
    try {
      stripeOpenStatus = await syncCustomerSubscriptions(env, secretKey, userId, stripeCustomerId);
    } catch (error) {
      if (!isMissingStripeCustomer(error)) {
        log("error", "stripe_subscription_check_failed", {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return billingUnavailable();
      }
      // A customer Stripe does not have holds no subscription in this mode.
      stripeCustomerId = await replaceMissingStripeCustomer(db, secretKey, userId, stripeCustomerId);
      canReplaceCustomer = false;
    }
    const stripeConflict = openSubscriptionConflict(stripeOpenStatus);
    if (stripeConflict) return stripeConflict;
  } else {
    // The idempotency key makes concurrent first checkouts share one Stripe customer.
    const createdCustomerId = await createStripeCustomer(db, secretKey, userId, `customer-${userId}`);
    stripeCustomerId = await storeFirstStripeCustomer(db, userId, createdCustomerId);
    if (stripeCustomerId !== createdCustomerId) {
      // Another request stored a customer first. Its subscriptions were not checked
      // here, so the user starts again rather than risk a second subscription.
      log("warn", "stripe_customer_already_stored", { userId, stripeCustomerId: createdCustomerId });
      return checkoutInProgress();
    }
  }

  const successUrl = `${origin}${SETTINGS_PATH}?billing=success`;
  const cancelUrl = `${origin}${SETTINGS_PATH}?billing=cancel`;
  const paramsDigest = await shortDigest(`${proPriceId} ${successUrl} ${cancelUrl}`);

  const createSession = (customerId: string) =>
    stripePostForm<StripeCheckoutSession>(
      secretKey,
      "/v1/checkout/sessions",
      {
        mode: "subscription",
        customer: customerId,
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
        // The customer and a digest of the other parameters are part of the key:
        // Stripe rejects a reused key whose parameters changed, as they do after a
        // customer is replaced or when a request comes from another origin.
        idempotencyKey: `checkout-${userId}-${customerId}-${paramsDigest}-${Math.floor(Date.now() / 300_000)}`,
      },
    );

  let session: StripeCheckoutSession;
  try {
    session = await createSession(stripeCustomerId);
  } catch (error) {
    // A deleted customer can still list subscriptions (none) but cannot check out.
    if (!canReplaceCustomer || !isMissingStripeCustomer(error)) throw error;
    stripeCustomerId = await replaceMissingStripeCustomer(db, secretKey, userId, stripeCustomerId);
    session = await createSession(stripeCustomerId);
  }

  if (!session.url) return jsonError("Stripe session missing URL", 500);
  return json({ url: session.url });
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
        return jsonError("Organization not found", 404);
      }
    }

    const billingEnabled = Boolean(getStripeBillingConfig(env));
    if (teamId) {
      // Organization access must not expose the User's Personal billing state.
      const entitlements = await getEntitlementsForContext(env, { type: "team", teamId, userId });
      return json({ plan: entitlements.plan, limits: entitlements.limits, billingEnabled });
    }

    const [entitlements, subscription] = await Promise.all([
      getEntitlementsForUser(env, userId),
      getPersonalSubscriptionSummary(env, userId),
    ]);
    return json({
      plan: entitlements.plan,
      limits: entitlements.limits,
      billingEnabled,
      subscriptionStatus: subscription.openStatus,
      canManageBilling: subscription.hasCustomer,
      managedBySupport: entitlements.source === "user_override",
    });
  }

  if (request.method === "POST" && billingSubpath[0] === "checkout") {
    try {
      return await startCheckout(env, userId, origin);
    } catch (error) {
      if (!isStripeIdempotencyConflict(error)) throw error;
      log("info", "stripe_checkout_in_progress", { userId });
      return checkoutInProgress();
    }
  }

  if (request.method === "POST" && billingSubpath[0] === "portal") {
    const stripe = getStripeBillingConfig(env);
    if (!stripe) return billingUnavailable();
    const { secretKey } = stripe;
    const db = createDb(env);
    const { stripe_customers } = schema;

    const [existingCustomer] = await db
      .select()
      .from(stripe_customers)
      .where(eq(stripe_customers.user_id, userId))
      .limit(1);

    if (!existingCustomer?.stripe_customer_id) {
      // Pro granted by support never creates a Stripe customer, so there is nothing to manage.
      return jsonError("There is no subscription to manage for this account. Contact support.", 409, {
        code: "no_billing_account",
      });
    }

    const returnUrl = `${origin}${SETTINGS_PATH}`;
    let portal: StripePortalSession;
    try {
      portal = await stripePostForm<StripePortalSession>(secretKey, "/v1/billing_portal/sessions", {
        customer: existingCustomer.stripe_customer_id,
        return_url: returnUrl,
        configuration: env.STRIPE_PORTAL_CONFIGURATION_ID,
      });
    } catch (error) {
      if (!isMissingStripeCustomer(error)) throw error;
      // Checkout replaces the missing customer; the portal has nothing to show for one.
      log("warn", "stripe_customer_missing", { userId, stripeCustomerId: existingCustomer.stripe_customer_id });
      return jsonError("Your billing account could not be found. Contact support.", 409, {
        code: "billing_customer_missing",
      });
    }

    return json({ url: portal.url });
  }

  return jsonError("Not Found", 404);
}

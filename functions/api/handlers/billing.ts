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
import { settleOpenCheckoutSessions } from "../utils/stripe-checkout-sessions";
import { getSessionUserId } from "../utils/session";
import { checkRateLimit } from "../utils/rate-limit";
import { ROUTE_RATE_LIMIT_MESSAGES } from "../utils/route-rate-limit";
import { getEntitlementsForContext, getEntitlementsForUser } from "../utils/entitlements";
import { describeErrorForLog, log } from "../utils/logger";
import {
  getPersonalSubscriptionSummary,
  isPaidSubscriptionStatus,
  listOpenStoredSubscriptions,
  mostUrgentOpenStatus,
  openStoredStatusOnPrices,
  refreshStoredSubscriptions,
  syncCustomerSubscriptions,
  type SubscriptionSnapshot,
} from "../utils/stripe-subscriptions";
import { canViewTeam, getActiveTeamMembership, normalizeTeamRole } from "../utils/team-access";

type Db = ReturnType<typeof createDb>;
type StripeCheckoutSession = { id: string; url: string | null };
type StripePortalSession = { id: string; url: string };

// The SPA's settings page (buildConsoleSettingsPath() in src/lib/routes.ts, which the
// API cannot import). Stripe returns here directly: Billing reads ?billing= on it, and
// a redirecting legacy path such as /account could drop that query.
const SETTINGS_PATH = "/dashboard/settings/";

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

function checkoutIncomplete(): Response {
  return jsonError("Your previous checkout has not finished yet. Try again later.", 409, {
    code: "checkout_incomplete",
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

/** The checkout answer from a stored open status alone, when Stripe cannot decide. */
function storedSubscriptionConflict(openStatus: string): Response {
  if (openStatus === "incomplete") return checkoutIncomplete();
  return openSubscriptionConflict(openStatus) ?? alreadySubscribed();
}

/**
 * Returns the stored status that keeps a customer Stripe reports missing, or null when
 * it may be replaced. Only the current keys' mode sells a price in proPriceIds, so an
 * open subscription stored on one means the deployed keys are wrong (the other mode's
 * secret key, say), not that the customer was left by the other mode. Replacing it
 * then would move a paying subscriber to an empty customer, so it is kept.
 */
async function statusKeepingMissingCustomer(
  db: Db,
  userId: string,
  missingCustomerId: string,
  proPriceIds: string[],
): Promise<string | null> {
  const status = await openStoredStatusOnPrices(db, userId, proPriceIds);
  if (status) {
    log("error", "stripe_customer_missing_with_subscription", {
      userId,
      stripeCustomerId: missingCustomerId,
      subscriptionStatus: status,
    });
  }
  return status;
}

/**
 * The checkout decision from the subscriptions Stripe lists as open. An `incomplete` one
 * is a Checkout first payment that did not go through (a declined card or an abandoned
 * 3DS step). The Customer Portal cannot pay it, but a retry in its own open session
 * activates that same subscription, so that session is reused. Expiring a session
 * cancels its incomplete subscription; one no reusable session holds still blocks.
 */
function stripeSubscriptionConflict(
  open: SubscriptionSnapshot[],
  reusableSubscriptionId: string | null,
): Response | null {
  const unfinished = open.filter((subscription) => subscription.status === "incomplete");
  const others = open.filter((subscription) => subscription.status !== "incomplete");
  const conflict = openSubscriptionConflict(mostUrgentOpenStatus(others.map((subscription) => subscription.status)));
  if (conflict) return conflict;
  const resumable = unfinished.every((subscription) => subscription.id === reusableSubscriptionId);
  return resumable ? null : checkoutIncomplete();
}

/** Starts a Personal Pro Checkout Session, or explains why the user cannot buy one. */
async function startCheckout(env: Env, userId: string, origin: string): Promise<Response> {
  const stripe = getStripeBillingConfig(env);
  if (!stripe) return billingUnavailable();
  const { secretKey, proPriceId, proPriceIds } = stripe;
  const entitlements = await getEntitlementsForUser(env, userId);
  if (entitlements.plan === "pro") return alreadySubscribed();
  // A manual override outranks Stripe, so a subscription bought under a Free
  // override would be billed without ever granting Pro.
  if (entitlements.source === "user_override") {
    return jsonError("Your plan is managed by support. Contact support to change it.", 409, {
      code: "plan_managed_by_support",
    });
  }

  const db = createDb(env);
  const { stripe_customers } = schema;

  const [existingCustomer] = await db
    .select()
    .from(stripe_customers)
    .where(eq(stripe_customers.user_id, userId))
    .limit(1);
  const storedOpen = await listOpenStoredSubscriptions(db, userId);

  if (!existingCustomer?.stripe_customer_id) {
    // Webhooks store the customer with the subscription, so this should not happen:
    // with no customer to ask Stripe about, stored rows decide, rather than risk a
    // second subscription.
    const openStatus = mostUrgentOpenStatus(storedOpen.map((subscription) => subscription.status));
    if (openStatus) return storedSubscriptionConflict(openStatus);
  }

  const successUrl = `${origin}${SETTINGS_PATH}?billing=success`;
  const cancelUrl = `${origin}${SETTINGS_PATH}?billing=cancel`;
  const paramsDigest = await shortDigest(`${proPriceId} ${successUrl} ${cancelUrl}`);

  let stripeCustomerId: string;
  // An open Checkout Session for this same checkout, sent back instead of a new one.
  let reusableSessionUrl: string | null = null;
  // The incomplete subscription a declined payment in that session left, if any.
  let reusableSubscriptionId: string | null = null;
  // A stored customer can be gone from Stripe (deleted, or from the other mode's keys).
  // It is replaced at most once per request, and only when Stripe says it is missing.
  let canReplaceCustomer = false;

  if (existingCustomer?.stripe_customer_id) {
    const storedCustomerId = existingCustomer.stripe_customer_id;
    stripeCustomerId = storedCustomerId;
    canReplaceCustomer = true;
    // Every open Checkout Session is payable for 24 hours and opens its own subscription.
    // Expire the others before listing subscriptions, so none can complete unseen after
    // the check. A session paid in the meantime fails to expire, and the retry sees it.
    try {
      const openSessions = await settleOpenCheckoutSessions(secretKey, stripeCustomerId, {
        userId,
        paramsDigest,
        nowSeconds: Math.floor(Date.now() / 1000),
      });
      if (openSessions.kind === "changed") return checkoutInProgress();
      if (openSessions.kind === "reuse") {
        reusableSessionUrl = openSessions.url;
        reusableSubscriptionId = openSessions.subscriptionId;
      }
    } catch (error) {
      log("error", "stripe_open_checkout_check_failed", {
        userId,
        ...describeErrorForLog(error),
      });
      return billingUnavailable();
    }
    // D1 learns about subscriptions from webhooks, which can lag or fail, so Stripe
    // decides for the stored customer's subscriptions, stored or not. Fail closed: a
    // missed subscription would be billed twice.
    let stripeOpenSubscriptions: SubscriptionSnapshot[] = [];
    try {
      stripeOpenSubscriptions = await syncCustomerSubscriptions(env, secretKey, userId, stripeCustomerId);
    } catch (error) {
      if (!isMissingStripeCustomer(error)) {
        log("error", "stripe_subscription_check_failed", {
          userId,
          ...describeErrorForLog(error),
        });
        return billingUnavailable();
      }
      // A customer Stripe does not have holds no subscription in this mode.
      const keptStatus = await statusKeepingMissingCustomer(db, userId, stripeCustomerId, proPriceIds);
      if (keptStatus) return storedSubscriptionConflict(keptStatus);
      stripeCustomerId = await replaceMissingStripeCustomer(db, secretKey, userId, stripeCustomerId);
      canReplaceCustomer = false;
      reusableSessionUrl = null;
      reusableSubscriptionId = null;
    }
    // A subscription stored for another customer is read from Stripe by id: a real one
    // still blocks, and one Stripe does not have (left by the other mode's keys) no
    // longer does. Its row is left as it was.
    const otherStored = storedOpen.filter((subscription) => subscription.customerId !== storedCustomerId);
    let otherOpenSubscriptions: SubscriptionSnapshot[] = [];
    try {
      otherOpenSubscriptions = await refreshStoredSubscriptions(env, secretKey, userId, otherStored);
    } catch (error) {
      log("error", "stripe_subscription_check_failed", {
        userId,
        ...describeErrorForLog(error),
      });
      return billingUnavailable();
    }
    const stripeConflict = stripeSubscriptionConflict(
      [...stripeOpenSubscriptions, ...otherOpenSubscriptions],
      reusableSubscriptionId,
    );
    if (stripeConflict) return stripeConflict;
    if (reusableSessionUrl) return json({ url: reusableSessionUrl });
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
        // Lets a later checkout recognize this session as the same one and reuse it.
        "metadata[checkoutParams]": paramsDigest,
        "subscription_data[metadata][userId]": userId,
        allow_promotion_codes: true,
      },
      {
        // Join concurrent requests (a retry or double submit) in the same five-minute
        // window to one Checkout Session; later attempts reuse or expire it above.
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
    const keptStatus = await statusKeepingMissingCustomer(db, userId, stripeCustomerId, proPriceIds);
    if (keptStatus) return storedSubscriptionConflict(keptStatus);
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
    const { secretKey, proPriceIds } = stripe;
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
      const missingCustomerId = existingCustomer.stripe_customer_id;
      log("warn", "stripe_customer_missing", { userId, stripeCustomerId: missingCustomerId });
      if (await statusKeepingMissingCustomer(db, userId, missingCustomerId, proPriceIds)) {
        return jsonError("Your billing account could not be found. Contact support.", 409, {
          code: "billing_customer_missing",
        });
      }
      // The portal has nothing to show for a customer Stripe does not have. Replace it as
      // checkout would, so Billing stops showing that customer's stored subscriptions
      // (which only the other mode's keys can see) and offers Upgrade instead.
      await replaceMissingStripeCustomer(db, secretKey, userId, missingCustomerId);
      return jsonError("Your billing account could not be found. Choose Upgrade to start a new subscription.", 409, {
        code: "billing_customer_missing",
      });
    }

    return json({ url: portal.url });
  }

  return jsonError("Not Found", 404);
}

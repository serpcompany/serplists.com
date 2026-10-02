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

const SETTINGS_PATH = "/dashboard/settings/";
const ACCOUNT_STRIPE_CALL_LIMIT = { windowMs: 60 * 1000, max: 10 };
const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function getAppOrigin(request: Request, env: Env): string {
  return (env.FRONTEND_URL ? originOf(env.FRONTEND_URL) : null) ?? new URL(request.url).origin;
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

function openSubscriptionConflict(openStatus: string | null): Response | null {
  if (!openStatus) return null;
  if (isPaidSubscriptionStatus(openStatus)) return alreadySubscribed();
  return jsonError(
    "Your Pro subscription needs attention. Update your payment method with Manage subscription in Billing.",
    409,
    { code: "subscription_needs_attention" },
  );
}

function storedSubscriptionConflict(openStatus: string): Response {
  if (openStatus === "incomplete") return checkoutIncomplete();
  return openSubscriptionConflict(openStatus) ?? alreadySubscribed();
}

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

async function startCheckout(env: Env, userId: string, origin: string): Promise<Response> {
  const stripe = getStripeBillingConfig(env);
  if (!stripe) return billingUnavailable();
  const { secretKey, proPriceId, proPriceIds } = stripe;
  const entitlements = await getEntitlementsForUser(env, userId);
  if (entitlements.plan === "pro") return alreadySubscribed();
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
    const openStatus = mostUrgentOpenStatus(storedOpen.map((subscription) => subscription.status));
    if (openStatus) return storedSubscriptionConflict(openStatus);
  }

  const successUrl = `${origin}${SETTINGS_PATH}?billing=success`;
  const cancelUrl = `${origin}${SETTINGS_PATH}?billing=cancel`;
  const paramsDigest = await shortDigest(`${proPriceId} ${successUrl} ${cancelUrl}`);

  let stripeCustomerId: string;
  let reusableSessionUrl: string | null = null;
  let reusableSubscriptionId: string | null = null;
  let canReplaceCustomer = false;

  if (existingCustomer?.stripe_customer_id) {
    const storedCustomerId = existingCustomer.stripe_customer_id;
    stripeCustomerId = storedCustomerId;
    canReplaceCustomer = true;
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
      const keptStatus = await statusKeepingMissingCustomer(db, userId, stripeCustomerId, proPriceIds);
      if (keptStatus) return storedSubscriptionConflict(keptStatus);
      stripeCustomerId = await replaceMissingStripeCustomer(db, secretKey, userId, stripeCustomerId);
      canReplaceCustomer = false;
      reusableSessionUrl = null;
      reusableSubscriptionId = null;
    }
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
    const createdCustomerId = await createStripeCustomer(db, secretKey, userId, `customer-${userId}`);
    stripeCustomerId = await storeFirstStripeCustomer(db, userId, createdCustomerId);
    if (stripeCustomerId !== createdCustomerId) {
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
        "metadata[checkoutParams]": paramsDigest,
        "subscription_data[metadata][userId]": userId,
        allow_promotion_codes: true,
      },
      {
        idempotencyKey: `checkout-${userId}-${customerId}-${paramsDigest}-${Math.floor(Date.now() / CHECKOUT_IDEMPOTENCY_WINDOW_MS)}`,
      },
    );

  let session: StripeCheckoutSession;
  try {
    session = await createSession(stripeCustomerId);
  } catch (error) {
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
  const pathParts = url.pathname.split("/").filter(Boolean);
  const billingSubpath = pathParts.slice(2);

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
      await replaceMissingStripeCustomer(db, secretKey, userId, missingCustomerId);
      return jsonError("Your billing account could not be found. Choose Upgrade to start a new subscription.", 409, {
        code: "billing_customer_missing",
      });
    }

    return json({ url: portal.url });
  }

  return jsonError("Not Found", 404);
}
